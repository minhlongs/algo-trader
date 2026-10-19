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

import { LiveTradingOrchestrator } from './live-trading-orchestrator';
import { StrategyRunner } from './strategy-runner';
import { logger } from '../../shared/utils/logger';
import {
  resolveStrategyEntries,
  buildMultiRunnerStatus,
  type MultiRunnerConfig,
  type MultiRunnerStatus,
} from './multi-strategy-runner-helpers';

export {
  resolveStrategyEntries,
  buildMultiRunnerStatus,
  type MultiRunnerConfig,
  type MultiRunnerStatus,
};

// ── Runner ─────────────────────────────────────────────────────────────────────

export class MultiStrategyRunner {
  private config: MultiRunnerConfig;
  private orchestrator: LiveTradingOrchestrator;
  private runners: StrategyRunner[] = [];
  private status: 'stopped' | 'running' | 'error' = 'stopped';

  constructor(config: MultiRunnerConfig) {
    const entries = resolveStrategyEntries(config.strategies);
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
    return buildMultiRunnerStatus(this.status, this.orchestrator, this.runners);
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
