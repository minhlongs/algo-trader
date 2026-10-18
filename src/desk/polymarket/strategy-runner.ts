/**
 * Strategy Runner — Wires a V2 Polymarket strategy to the live trading pipeline end-to-end.
 * Supports any strategy extending BasePolymarketStrategy.
 */

import type { StrategyName } from '../core/types';
import type { BasePolymarketStrategy } from '@desk/strategies/polymarket/base-polymarket-strategy';
import { StrategyLiveBridge } from './strategy-live-bridge';
import { LiveOrderManagerProxy } from './live-order-manager-proxy';
import { LiveTradingOrchestrator } from './live-trading-orchestrator';
import { logger } from '@shared/utils/logger';
import { tradingEventBus, type PriceUpdatePayload } from '../events/trading-event-bus';
import type { StrategyRunnerConfig, RunnerStatus, StrategyConstructor } from './strategy-runner-types';
import { createTickTimer, type TickTimerContext } from './strategy-runner-tick-timer';
import { createEventBusSubscription, type EventHandlerContext } from './strategy-runner-event-handlers';
import { buildRunnerStatusSnapshot } from './strategy-runner-status-builder';
import {
  processPriceUpdate, deriveStrategyName, createRunnerStrategyDeps,
  createTickTriggerPayload, startHealthCheckTimer, clearRunnerTimers,
  type StrategyExecutionContext,
} from './strategy-runner-executor';
import type { StrategyEntryConstructor } from './strategy-registry-types';

export type { StrategyRunnerConfig, RunnerStatus, StrategyConstructor } from './strategy-runner-types';
export { DEFAULT_RUNNER_CONFIG, GammaClientImpl } from './strategy-runner-types';
export * from './strategy-runner-executor';

export class StrategyRunner {
  private strategyClass: StrategyConstructor;
  private config: Required<Pick<StrategyRunnerConfig, 'minExecutionIntervalMs' | 'autoScan'>> & StrategyRunnerConfig;
  private orchestrator: LiveTradingOrchestrator;
  private bridge: StrategyLiveBridge | null = null;
  private proxy: LiveOrderManagerProxy | null = null;
  private strategy: BasePolymarketStrategy | null = null;
  private executionCount = 0;
  private status: 'stopped' | 'running' | 'error' = 'stopped';
  private strategyName: string;
  private ownsOrchestrator: boolean;
  private eventBus = tradingEventBus;
  private unsubscribeFromEvents: (() => void) | null = null;
  private lastExecutionTime = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private trackedTokens = new Set<string>();

  constructor(
    strategyClass: StrategyConstructor | StrategyEntryConstructor,
    config: StrategyRunnerConfig,
    externalOrchestrator?: LiveTradingOrchestrator,
  ) {
    this.strategyClass = strategyClass as unknown as StrategyConstructor;
    this.strategyName = deriveStrategyName(strategyClass);
    this.config = { minExecutionIntervalMs: 50, autoScan: false, ...config };
    this.ownsOrchestrator = externalOrchestrator === undefined;
    this.orchestrator = externalOrchestrator ?? new LiveTradingOrchestrator(config.tradingConfig);
  }

  trackToken(tokenId: string): void { this.trackedTokens.add(tokenId); }
  untrackToken(tokenId: string): void { this.trackedTokens.delete(tokenId); }
  getTrackedTokens(): string[] { return Array.from(this.trackedTokens); }
  getOrchestrator(): LiveTradingOrchestrator { return this.orchestrator; }
  getBridge(): StrategyLiveBridge | null { return this.bridge; }

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'running';
    if (this.orchestrator.getStatus() !== 'running') await this.orchestrator.start();

    this.bridge = new StrategyLiveBridge(this.orchestrator);
    this.proxy = new LiveOrderManagerProxy(this.bridge, this.strategyName);
    const deps = createRunnerStrategyDeps(this.proxy);
    this.strategy = new this.strategyClass(deps, this.config.strategyConfig, this.strategyName as StrategyName);

    this.setupEventBus();
    if (this.config.tickIntervalMs && this.config.tickIntervalMs > 0) {
      this.tickTimer = this.createTickTimer();
    }
    this.healthCheckTimer = startHealthCheckTimer(
      () => this.status === 'running', this.strategyName, () => this.executionCount,
    );
    logger.info('Strategy runner started', 'StrategyRunner', {
      strategy: this.strategyName, mode: this.orchestrator.getMode(),
    });
  }

  async stop(): Promise<void> {
    this.status = 'stopped';
    this.unsubscribeFromEvents?.();
    this.unsubscribeFromEvents = null;
    clearRunnerTimers(this.healthCheckTimer, this.tickTimer);
    this.healthCheckTimer = null;
    this.tickTimer = null;
    if (this.ownsOrchestrator) await this.orchestrator.stop();
    logger.info('Strategy runner stopped', 'StrategyRunner', { executions: this.executionCount });
  }

  private buildExecutionBase() {
    return {
      status: this.status, strategy: this.strategy, strategyName: this.strategyName,
      executionCount: this.executionCount, lastExecutionTime: this.lastExecutionTime,
      trackedTokens: this.trackedTokens,
      updateLastExecutionTime: (time: number) => { this.lastExecutionTime = time; },
      incrementExecutionCount: () => { this.executionCount++; },
      stop: () => this.stop(),
    };
  }

  private setupEventBus(): void {
    const ctx: EventHandlerContext = { ...this.buildExecutionBase(), config: this.config };
    const sub = createEventBusSubscription(this.eventBus, ctx);
    sub.subscribe();
    this.unsubscribeFromEvents = () => sub.unsubscribe();
  }

  private createTickTimer(): NodeJS.Timeout {
    const ctx: TickTimerContext = {
      status: this.status, strategyName: this.strategyName,
      tickIntervalMs: this.config.tickIntervalMs!, trackedTokens: this.trackedTokens,
      execute: async () => {
        if (this.trackedTokens.size === 0) this.trackedTokens.add('tick-trigger');
        await this.handlePriceUpdate(createTickTriggerPayload());
      },
    };
    return createTickTimer(ctx).start();
  }

  private async handlePriceUpdate(payload: PriceUpdatePayload): Promise<void> {
    return processPriceUpdate({
      ...this.buildExecutionBase(),
      minExecutionIntervalMs: this.config.minExecutionIntervalMs,
      maxTicks: this.config.maxTicks,
    }, payload);
  }

  getStatus() {
    return buildRunnerStatusSnapshot({
      status: this.status, strategyName: this.strategyName, executionCount: this.executionCount,
      trackedTokens: this.getTrackedTokens(), orchestrator: this.orchestrator, proxy: this.proxy,
    });
  }
}
