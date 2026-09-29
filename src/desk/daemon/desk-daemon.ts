/**
 * Desk Daemon — Multi-Engine Master Autonomous Execution Daemon
 * Milestone M3: Concurrent Multi-Engine Background Supervisor & Worker Daemon
 */

import { logger } from '../../shared/utils/logger';
import type { DeskAutoConfig, IDeskDaemon } from '../commands/desk-auto-types';
import { UnifiedTradingLoop, type StepExecutionResult } from '../orchestrator/unified-trading-loop';
import { FeedFreshnessWatchdog } from '../feeds/feed-freshness-watchdog';
import type { DynamicMidPriceProvider } from '../feeds/dynamic-mid-price-provider';
import { EngineSupervisor } from './engine-supervisor';
import type { IEngineSupervisor } from './engine-supervisor-types';
import { DeskStatusServer } from './desk-status-server';
import type { DeskStatusEngineEntry, DeskStatusResponse, DeskAllocationsResponse } from './desk-status-server-types';
import { DeskMetricsRegistry } from '../telemetry/desk-metrics-registry';
import { type DeskDaemonOptions, type DriftVerificationResult, prioritizeTradeIntents, verifyZeroDrift } from './desk-daemon-types';

export class DeskDaemon implements IDeskDaemon {
  public readonly config: DeskAutoConfig;
  public readonly loop: UnifiedTradingLoop;
  public readonly supervisor: IEngineSupervisor;
  public readonly watchdog: FeedFreshnessWatchdog;
  public readonly metricsRegistry: DeskMetricsRegistry;
  public readonly server: DeskStatusServer;
  public readonly midPriceProvider?: DynamicMidPriceProvider;
  private readonly options: DeskDaemonOptions;
  private running = false;
  private startedAt = 0;
  private cycleCount = 0;
  private processedOrders = 0;
  private timer: NodeJS.Timeout | null = null;
  private boundSignals: Array<{ event: string; listener: () => void }> = [];

  constructor(optionsOrConfig: DeskAutoConfig | DeskDaemonOptions) {
    this.options = 'config' in optionsOrConfig ? optionsOrConfig : { config: optionsOrConfig };
    this.config = this.options.config;
    const cash = this.config.capitalUsd * 0.20, alloc = (this.config.capitalUsd - cash) / 4;
    this.loop = this.options.loop ?? new UnifiedTradingLoop(this.config.mode, this.config.capitalUsd, cash);
    if (!this.options.loop) {
      this.loop.riskGate.setEngineBudgets({ arbitrage: alloc, marl: alloc, amm: alloc, 'alpha-lab': alloc });
      this.loop.riskGate.setNavAndCash(this.config.capitalUsd, cash);
    }
    this.supervisor = this.options.supervisor ?? new EngineSupervisor();
    this.watchdog = this.options.watchdog ?? new FeedFreshnessWatchdog({ maxStalenessMs: 5000 });
    this.midPriceProvider = this.options.midPriceProvider;
    this.metricsRegistry = this.options.metricsRegistry ?? new DeskMetricsRegistry();
    this.server = new DeskStatusServer({
      port: this.config.metricsPort,
      metricsRegistry: this.metricsRegistry,
      dataProvider: {
        getUptimeSeconds: () => this.getUptimeSeconds(),
        getStatus: () => this.getStatus() as unknown as DeskStatusResponse,
        getAllocations: () => this.getAllocationsPayload(),
        getMetricsText: () => this.metricsRegistry.getMetricsText(),
      },
    });
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = Date.now();
    this.watchdog.attachToLoop(this.loop);
    if (this.options.multiplexer) this.watchdog.attachToMultiplexer(this.options.multiplexer);
    this.watchdog.start();
    await this.supervisor.start();
    this.updateMetrics();
    if (this.server && !this.options.skipServer) await this.server.start();
    this.bindSignalHandlers();
    this.timer = setInterval(() => { void this.tick(); }, this.config.pollIntervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    logger.info(`[DeskDaemon] Daemon started in ${this.config.mode} mode`, { capital: this.config.capitalUsd });
  }

  public async stop(): Promise<void> {
    if (!this.running && this.loop.getState() === 'STOPPED') return;
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.unbindSignalHandlers();
    this.watchdog.stop();
    await this.supervisor.stop();
    if (this.server?.isRunning()) await this.server.stop();
    if (this.loop.getState() === 'RUNNING') this.loop.lifecycle.transitionTo('STOPPED', 'Daemon stopped');
    logger.info('[DeskDaemon] Daemon stopped gracefully', { cycles: this.cycleCount });
  }

  public isRunning(): boolean { return this.running; }
  public getCycleCount(): number { return this.cycleCount; }
  public getProcessedOrders(): number { return this.processedOrders; }
  public getUptimeSeconds(): number {
    return this.running ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
  }

  public async tick(): Promise<StepExecutionResult[]> {
    if (!this.running || this.loop.getState() !== 'RUNNING') return [];
    this.cycleCount++;
    this.watchdog.checkFreshness();
    if (this.watchdog.isTripped()) return [];
    const rawIntents = await this.supervisor.pollCycle();
    const prioritized = rawIntents.length > 0 ? prioritizeTradeIntents(rawIntents) : [];
    const results: StepExecutionResult[] = [];
    for (const intent of prioritized) {
      if (this.loop.getState() !== 'RUNNING') break;
      const unitPrice = this.midPriceProvider?.getMidPrice(intent.symbol, intent.venue) ?? intent.price;
      const stepRes = this.loop.step(intent, unitPrice);
      results.push(stepRes);
      if (stepRes.enqueued) this.processedOrders++;
    }
    const interval = this.options.reconciliationIntervalCycles ?? 1;
    if (this.cycleCount % interval === 0) this.verifyAccountingDrift();
    this.updateMetrics();
    return results;
  }

  public updateMetrics(): void {
    const allocated = this.loop.riskGate.getEngineBudgets();
    const drift = this.verifyAccountingDrift();
    this.metricsRegistry.updateFromSnapshot({
      allocatedCapital: allocated,
      queueDepth: this.loop.queue.size(),
      fillRate: this.processedOrders > 0 ? 1.0 : 0.0,
      circuitBreakerTier: this.loop.riskGate.getTier(),
      driftUsd: drift.driftUsd,
    });
  }

  public getAllocationsPayload(): DeskAllocationsResponse {
    const nav = this.loop.riskGate.getNav(), alloc = this.loop.riskGate.getEngineBudgets(), cash = this.loop.riskGate.getCash();
    const drift = verifyZeroDrift(nav, alloc, cash);
    return {
      totalNavUsd: nav, unallocatedCashUsd: cash, cashBufferRatio: nav > 0 ? cash / nav : 0,
      allocations: alloc, allocatedCapitalUsd: alloc, driftUsd: drift.driftUsd, isZeroDrift: drift.valid,
    };
  }

  public verifyAccountingDrift(): DriftVerificationResult {
    const nav = this.loop.riskGate.getNav(), allocated = this.loop.riskGate.getEngineBudgets(), cash = this.loop.riskGate.getCash();
    const result = verifyZeroDrift(nav, allocated, cash);
    if (!result.valid) logger.error(`[DeskDaemon] Zero Accounting Drift violated: ${result.driftUsd.toFixed(6)} USD`);
    return result;
  }

  public async triggerEmergencyHalt(reason = 'Critical emergency halt'): Promise<number> {
    const t0 = performance.now();
    this.loop.triggerEmergencyHalt(reason);
    this.options.onHalt?.(reason);
    const cancelFn = this.options.cancelAllOrders ?? (async () => {});
    await Promise.race([cancelFn(), new Promise<void>((r) => setTimeout(r, 100))]);
    if (this.server?.isRunning()) await this.server.stop();
    await this.stop();
    const elapsedMs = performance.now() - t0;
    logger.warn(`[DeskDaemon] Emergency halt executed in ${elapsedMs.toFixed(2)}ms (${reason})`);
    return elapsedMs;
  }

  public async handleSignal(signalName: string): Promise<number> {
    const elapsed = await this.triggerEmergencyHalt(`OS signal ${signalName} received`);
    if (this.options.exitOnSignal && process.env.NODE_ENV !== 'test') process.exit(0);
    return elapsed;
  }

  public getStatus(): Record<string, unknown> {
    const nav = this.loop.riskGate.getNav(), allocated = this.loop.riskGate.getEngineBudgets() as Record<string, number>, cash = this.loop.riskGate.getCash();
    const drift = verifyZeroDrift(nav, allocated, cash), supEngines = this.supervisor.getEngineStatuses();
    const engines: Record<string, DeskStatusEngineEntry> = {};
    for (const [id, s] of Object.entries(supEngines)) {
      engines[id] = { status: s.status, allocatedCapitalUsd: allocated[id] ?? 0, lastSignalTime: s.lastSignalTime, error: s.error };
    }
    if (!engines['alpha-lab']) {
      engines['alpha-lab'] = { status: this.running ? 'RUNNING' : 'STOPPED', allocatedCapitalUsd: allocated['alpha-lab'] ?? 0 };
    }
    return {
      status: this.running ? this.loop.getState() : 'STOPPED', mode: this.config.mode, capitalUsd: this.config.capitalUsd,
      dryRun: this.config.dryRun, circuitBreakerTier: this.loop.riskGate.getTier(), navUsd: nav, driftUsd: drift.driftUsd,
      uptimeSeconds: this.getUptimeSeconds(), cycleCount: this.cycleCount, exchanges: [...this.config.exchanges],
      symbols: [...this.config.symbols], engines, isDriftValid: drift.valid,
      queueDepth: this.loop.queue.size(), processedOrders: this.processedOrders, allocatedCapitalUsd: allocated, unallocatedCashUsd: cash,
      allocations: { allocatedCapitalUsd: allocated, unallocatedCashUsd: cash, driftUsd: drift.driftUsd },
    };
  }

  private bindSignalHandlers(): void {
    if (this.options.skipSignalHandlers) return;
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    for (const sig of signals) {
      const listener = () => { void this.handleSignal(sig); };
      process.on(sig, listener);
      this.boundSignals.push({ event: sig, listener });
    }
  }

  private unbindSignalHandlers(): void {
    for (const { event, listener } of this.boundSignals) process.removeListener(event, listener);
    this.boundSignals = [];
  }
}
