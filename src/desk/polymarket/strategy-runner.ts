/**
 * Strategy Runner
 *
 * Wires a V2 Polymarket strategy to the live trading pipeline end-to-end.
 * Supports any strategy extending BasePolymarketStrategy.
 *
 * Usage:
 * const runner = new StrategyRunner(SpreadMeanReversionStrategy, {
 *   strategyConfig: DEFAULT_CONFIG,
 *   tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
 * });
 * await runner.start();
 * await runner.stop();
 */

import type { StrategyName } from '../core/types';
import type { BasePolymarketStrategy, BaseStrategyConfig, StrategyDeps } from '@desk/strategies/polymarket/base-polymarket-strategy';
import { StrategyLiveBridge } from './strategy-live-bridge';
import { LiveOrderManagerProxy } from './live-order-manager-proxy';
import { LiveTradingOrchestrator } from './live-trading-orchestrator';
import { logger } from '@shared/utils/logger';
import { tradingEventBus, type PriceUpdatePayload } from '../events/trading-event-bus';
import type { StrategyRunnerConfig } from './strategy-runner-types';
import { createTickTimer, type TickTimerContext } from './strategy-runner-tick-timer';
import { createEventBusSubscription, type EventHandlerContext } from './strategy-runner-event-handlers';

// Re-export for backward compatibility
export type { StrategyRunnerConfig, RunnerStatus, StrategyConstructor } from './strategy-runner-types';
export { DEFAULT_RUNNER_CONFIG, GammaClientImpl } from './strategy-runner-types';

type StrategyConstructor = new (deps: StrategyDeps, config: BaseStrategyConfig, name: StrategyName) => BasePolymarketStrategy;

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
    strategyClass: StrategyConstructor,
    config: StrategyRunnerConfig,
    externalOrchestrator?: LiveTradingOrchestrator
  ) {
    this.strategyClass = strategyClass;
    this.strategyName = strategyClass.name
      .replace(/Strategy$/, '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    this.config = { minExecutionIntervalMs: 50, autoScan: false, ...config };
    this.ownsOrchestrator = externalOrchestrator === undefined;
    this.orchestrator = externalOrchestrator ?? new LiveTradingOrchestrator(config.tradingConfig);
  }

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'running';

    if (this.orchestrator.getStatus() !== 'running') {
      await this.orchestrator.start();
    }

    this.bridge = new StrategyLiveBridge(this.orchestrator);
    this.proxy = new LiveOrderManagerProxy(this.bridge, this.strategyName);

    const deps: StrategyDeps = {
      clob: null as unknown as StrategyDeps['clob'],
      orderManager: this.proxy,
      eventBus: { emit: () => {}, on: () => {}, off: () => {} },
      gamma: null as unknown as StrategyDeps['gamma'],
    };
    this.strategy = new this.strategyClass(deps, this.config.strategyConfig, this.strategyName as StrategyName);

    this.setupEventBus();

    if (this.config.tickIntervalMs && this.config.tickIntervalMs > 0) {
      this.tickTimer = this.createTickTimer();
    }

    this.healthCheckTimer = setInterval(() => this.healthCheck(), 60_000);
    this.healthCheckTimer.unref();

    logger.info('Strategy runner started', 'StrategyRunner', {
      strategy: this.strategyName,
      mode: this.orchestrator.getMode(),
    });
  }

  async stop(): Promise<void> {
    this.status = 'stopped';
    this.unsubscribeFromEvents?.();
    this.unsubscribeFromEvents = null;
    if (this.healthCheckTimer) { clearInterval(this.healthCheckTimer); this.healthCheckTimer = null; }
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.ownsOrchestrator) { await this.orchestrator.stop(); }
    logger.info('Strategy runner stopped', 'StrategyRunner', { executions: this.executionCount });
  }

  private setupEventBus(): void {
    const ctx: EventHandlerContext = {
      status: this.status,
      strategy: this.strategy,
      config: this.config,
      strategyName: this.strategyName,
      executionCount: this.executionCount,
      lastExecutionTime: this.lastExecutionTime,
      trackedTokens: this.trackedTokens,
      updateLastExecutionTime: (time: number) => { this.lastExecutionTime = time; },
      incrementExecutionCount: () => { this.executionCount++; },
      stop: () => this.stop(),
    };
    const sub = createEventBusSubscription(this.eventBus, ctx);
    sub.subscribe();
    this.unsubscribeFromEvents = () => sub.unsubscribe();
  }

  trackToken(tokenId: string): void { this.trackedTokens.add(tokenId); }
  untrackToken(tokenId: string): void { this.trackedTokens.delete(tokenId); }
  getTrackedTokens(): string[] { return Array.from(this.trackedTokens); }

  private createTickTimer(): NodeJS.Timeout {
    const ctx: TickTimerContext = {
      status: this.status,
      strategyName: this.strategyName,
      tickIntervalMs: this.config.tickIntervalMs!,
      trackedTokens: this.trackedTokens,
      execute: async () => {
        if (this.trackedTokens.size === 0) { this.trackedTokens.add('tick-trigger'); }
        await this.handlePriceUpdate({ tokenId: 'tick-trigger', bid: 0, ask: 0, timestamp: Date.now() });
      },
    };
    return createTickTimer(ctx).start();
  }

  private async handlePriceUpdate(payload: PriceUpdatePayload): Promise<void> {
    if (this.status !== 'running' || !this.strategy) return;
    const now = Date.now();
    if (now - this.lastExecutionTime < this.config.minExecutionIntervalMs) return;
    const isRelevant = this.trackedTokens.size === 0 || this.trackedTokens.has(payload.tokenId);
    if (!isRelevant) return;

    this.lastExecutionTime = now;
    try {
      this.executionCount++;
      await this.strategy.execute();
      if (this.config.maxTicks && this.executionCount >= this.config.maxTicks) {
        logger.info('Max ticks reached', 'StrategyRunner', { strategy: this.strategyName });
        await this.stop();
      }
      logger.debug('Execution complete', 'StrategyRunner', { execution: this.executionCount });
    } catch (err) {
      logger.error('Execution error', 'StrategyRunner', { err: String(err) });
    }
  }

  private healthCheck(): void {
    if (this.status !== 'running') return;
    logger.debug('Health check', 'StrategyRunner', { strategy: this.strategyName, executions: this.executionCount });
  }

  getStatus() {
    return {
      status: this.status,
      strategyName: this.strategyName,
      executionCount: this.executionCount,
      trackedTokens: this.getTrackedTokens(),
      tickCount: this.executionCount,
      mode: this.orchestrator.getMode(),
      positions: this.orchestrator.getPositions(),
      bridgeStats: this.proxy?.getStats().bridgeStats ?? { scansCompleted: 0, signalsProcessed: 0, signalsRejected: 0, isScanning: false, scannerActive: false },
      proxyStats: {
        ordersPlaced: this.executionCount,
        strategy: this.strategyName,
        ...this.proxy?.getStats(),
      },
    };
  }

  getOrchestrator(): LiveTradingOrchestrator {
    return this.orchestrator;
  }

  getBridge(): StrategyLiveBridge | null {
    return this.bridge;
  }
}
