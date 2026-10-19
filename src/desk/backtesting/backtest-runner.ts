/**
 * Backtest Runner
 *
 * Replays historical Gamma market data through any registered V2 strategy
 * and computes performance metrics. No real orders placed — trades are
 * simulated based on strategy signals.
 *
 * Facade: orchestration lives here; order management, mock clients, data
 * loading, and run-card provenance are split into sibling modules and
 * re-exported below so existing importers see an identical API.
 *
 * Usage:
 *   const runner = new BacktestRunner();
 *   const result = await runner.run({
 *     strategy: 'spread-mean-reversion',
 *     paperTrading: true,
 *     capitalUsdc: 5000,
 *     days: 30,
 *   });
 */

import type { StrategyName } from '../core/types';
import { getStrategy } from '../polymarket/strategy-registry';
import { GammaHistoricalProvider } from './gamma-historical-provider';
import { computeMetrics } from './metrics-calculator';
import { logger } from '../../shared/utils/logger';
import type { BacktestResult, BacktestRunnerOptions } from './types';
import { writeBacktestRunCard } from './backtest-run-card';
import {
  loadBacktestSnapshots,
  instantiateBacktestStrategy,
  replayStrategyTicks,
} from './backtest-runner-simulation';

// Facade re-exports — moved symbols keep their public API here.
export type { BacktestRunnerOptions, DataQualityGateConfig } from './types';
export { BacktestOrderManager } from './backtest-order-manager';
export { createTickState, createMockClob, createHistoricalGammaClient } from './backtest-mock-factory';
export type { TickState } from './backtest-mock-factory';
export { fetchFromOhlcvStore } from './backtest-data-loader';
export { writeBacktestRunCard } from './backtest-run-card';
export {
  loadBacktestSnapshots,
  instantiateBacktestStrategy,
  replayStrategyTicks,
  type StrategyConstructor,
} from './backtest-runner-simulation';

export class BacktestRunner {
  private historicalProvider = new GammaHistoricalProvider();

  async run(config: BacktestRunnerOptions): Promise<BacktestResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const warnings: string[] = [];

    // Look up strategy
    const entry = getStrategy(config.strategy);
    if (!entry) {
      throw new Error(`Unknown strategy: ${config.strategy}`);
    }

    // Fetch historical data — use OHLCV store if configured, else live Gamma API
    const { snapshots, candles: ohlcvCandles } = await loadBacktestSnapshots(
      this.historicalProvider,
      config,
      warnings,
    );

    // Build mock services with a shared tick state object
    const { strategy, orderManager, tickState } = instantiateBacktestStrategy(
      entry,
      config,
      snapshots,
    );

    // Replay ticks - advance tick state before each execute so strategies
    // see fresh market data on every call.
    await replayStrategyTicks(strategy, config.strategy, snapshots, tickState, orderManager);

    // Compute metrics
    const trades = orderManager.getTrades();
    const equityCurve = orderManager.getEquityCurve();
    const metrics = computeMetrics(trades, equityCurve);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    logger.info('Backtest complete', 'BacktestRunner', {
      strategy: config.strategy,
      trades: trades.length,
      pnl: metrics.totalPnl,
      sharpe: metrics.sharpeRatio,
    });

    const result: BacktestResult = {
      strategy: config.strategy as StrategyName,
      config,
      metrics,
      trades,
      equityCurve,
      startedAt,
      completedAt,
      durationMs,
      warnings,
    };

    // Provenance: write a run card if a directory was provided (fail-safe).
    writeBacktestRunCard(config, result, ohlcvCandles);

    return result;
  }

  clearCache(): void {
    this.historicalProvider.clearCache();
  }
}
