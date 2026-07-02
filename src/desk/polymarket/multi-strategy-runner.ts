/**
 * Multi-Strategy Runner
 *
 * Runs multiple V2 strategies concurrently, sharing one LiveTradingOrchestrator.
 * All strategies benefit from shared guard (cumulative position limits) and
 * shared journal (unified audit trail).
 *
 * Usage:
 *   const runner = new MultiStrategyRunner({
 *     strategies: ['spread-mean-reversion', 'momentum-cascade'],
 *     tradingConfig: { paperTrading: true, capitalUsdc: 5000 },
 *     tickIntervalMs: 15_000,
 *   });
 *   await runner.start();
 *   // ... ticks run for all strategies ...
 *   await runner.stop();
 */

import { LiveTradingOrchestrator, type LiveTradingConfig } from './live-trading-orchestrator';
import { StrategyRunner, type RunnerStatus } from './strategy-runner';
import { getStrategy, type StrategyEntry } from './strategy-registry';
import { logger } from '../../shared/utils/logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MultiRunnerConfig {
  /** Strategy names to run (kebab-case registry keys) */
  strategies: string[];
  /** Trading config — all strategies share this */
  tradingConfig: LiveTradingConfig;
  /** Tick interval in ms (all strategies tick at same cadence, staggered) */
  tickIntervalMs?: number;
  /** Max ticks (0=unlimited, shared across all runners) */
  maxTicks?: number;
}

export interface MultiRunnerStatus {
  status: 'stopped' | 'running' | 'error';
  mode: 'PAPER' | 'LIVE';
  runnerCount: number;
  runners: Array<{
    strategy: string;
    status: RunnerStatus['status'];
    ticks: number;
    orders: number;
    positions: number;
  }>;
  summary: {
    totalTicks: number;
    totalOrders: number;
    totalPositions: number;
  };
}

// ── Runner ─────────────────────────────────────────────────────────────────────

export class MultiStrategyRunner {
  private config: MultiRunnerConfig;
  private orchestrator: LiveTradingOrchestrator;
  private runners: StrategyRunner[] = [];
  private status: 'stopped' | 'running' | 'error' = 'stopped';

  constructor(config: MultiRunnerConfig) {
    if (config.strategies.length === 0) {
      throw new Error('At least one strategy required');
    }

    // Validate all strategies exist
    const missing: string[] = [];
    const entries: StrategyEntry[] = [];
    for (const name of config.strategies) {
      const entry = getStrategy(name);
      if (!entry) missing.push(name);
      else entries.push(entry);
    }
    if (missing.length > 0) {
      throw new Error(`Unknown strategies: ${missing.join(', ')}`);
    }

    this.config = config;

    // One shared orchestrator
    this.orchestrator = new LiveTradingOrchestrator(config.tradingConfig);

    // One runner per strategy, all share the orchestrator
    this.runners = entries.map((entry) =>
      new StrategyRunner(entry.ctor, {
        strategyConfig: entry.defaultConfig,
        tradingConfig: config.tradingConfig,
        tickIntervalMs: config.tickIntervalMs ?? 15_000,
        maxTicks: config.maxTicks ?? 0,
      }, this.orchestrator), // shared orchestrator
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'running';

    // Start shared orchestrator once
    await this.orchestrator.start();

    // Start all runners
    const results = await Promise.allSettled(
      this.runners.map((r) => r.start()),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.error(`${failed.length} runners failed to start`, 'MultiStrategyRunner');
      this.status = 'error';
      return;
    }

    logger.info(`Multi-strategy runner started with ${this.runners.length} strategies`, 'MultiStrategyRunner', {
      strategies: this.runners.map((r) => r.getStatus().strategyName),
      mode: this.orchestrator.getMode(),
    });
  }

  async stop(): Promise<void> {
    this.status = 'stopped';

    // Stop all runners (they won't stop orchestrator since they don't own it)
    await Promise.allSettled(this.runners.map((r) => r.stop()));

    // Stop shared orchestrator
    await this.orchestrator.stop();

    logger.info('Multi-strategy runner stopped', 'MultiStrategyRunner');
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  getStatus(): MultiRunnerStatus {
    const runnerStatuses = this.runners.map((r) => {
      const s = r.getStatus();
      return {
        strategy: s.strategyName,
        status: s.status,
        ticks: s.tickCount,
        orders: s.proxyStats.ordersPlaced,
        positions: this.orchestrator.getPositions().length,
      };
    });

    return {
      status: this.status,
      mode: this.orchestrator.getMode(),
      runnerCount: this.runners.length,
      runners: runnerStatuses,
      summary: {
        totalTicks: runnerStatuses.reduce((sum, r) => sum + r.ticks, 0),
        totalOrders: runnerStatuses.reduce((sum, r) => sum + r.orders, 0),
        totalPositions: this.orchestrator.getPositions().length,
      },
    };
  }

  /** Check if all runners have stopped (e.g., maxTicks reached) */
  isDone(): boolean {
    return this.runners.every((r) => r.getStatus().status === 'stopped');
  }

  /** Wait until all runners are done, then clean up */
  async waitForDone(): Promise<void> {
    while (!this.isDone()) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    // All runners stopped — not yet cleaned up
    if (this.status === 'running') {
      this.status = 'stopped';
      await this.orchestrator.stop();
    }
  }

  getOrchestrator(): LiveTradingOrchestrator {
    return this.orchestrator;
  }

  getRunners(): StrategyRunner[] {
    return [...this.runners];
  }
}
