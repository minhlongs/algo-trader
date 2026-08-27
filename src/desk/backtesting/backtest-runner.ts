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
import type { OrderManager } from '../polymarket/order-manager';
import type { BasePolymarketStrategy, StrategyDeps } from '../strategies/polymarket/base-polymarket-strategy';
import { getStrategy } from '../polymarket/strategy-registry';
import { GammaHistoricalProvider } from './gamma-historical-provider';
import { computeMetrics } from './metrics-calculator';
import { logger } from '../../shared/utils/logger';
import type { BacktestResult, HistoricalSnapshot } from './types';
import type { BacktestRunnerOptions } from './types';
import { BacktestOrderManager } from './backtest-order-manager';
import { createTickState, createMockClob, createHistoricalGammaClient } from './backtest-mock-factory';
import { fetchFromOhlcvStore, type LoadedHistoricalData } from './backtest-data-loader';
import { writeBacktestRunCard } from './backtest-run-card';
import type { OhlcvCandle } from '../data/ohlcv-store';

// Facade re-exports — moved symbols keep their public API here.
export type { BacktestRunnerOptions, DataQualityGateConfig } from './types';
export { BacktestOrderManager } from './backtest-order-manager';
export { createTickState, createMockClob, createHistoricalGammaClient } from './backtest-mock-factory';
export type { TickState } from './backtest-mock-factory';
export { fetchFromOhlcvStore } from './backtest-data-loader';
export { writeBacktestRunCard } from './backtest-run-card';

type StrategyConstructor = new (
  deps: StrategyDeps,
  config: Record<string, unknown>,
  name: string,
) => BasePolymarketStrategy;

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
    const ohlcvMarket = (config as unknown as Record<string, unknown>).ohlcvMarket as string | undefined;
    const ohlcvTimeframe = (config as unknown as Record<string, unknown>).ohlcvTimeframe as string | undefined;
    let snapshots: HistoricalSnapshot[];
    let ohlcvCandles: OhlcvCandle[] = [];
    if (ohlcvMarket && ohlcvTimeframe) {
      const loaded: LoadedHistoricalData = await fetchFromOhlcvStore(
        this.historicalProvider, ohlcvMarket, ohlcvTimeframe, config.days, config.dataQuality, warnings,
      );
      snapshots = loaded.snapshots;
      ohlcvCandles = loaded.candles;
    } else {
      snapshots = await this.historicalProvider.fetchHistoricalSnapshots(
        config.days, config.tickIntervalMs ?? 3_600_000,
      );
    }

    if (snapshots.length === 0) {
      throw new Error('No historical data available for backtest');
    }

    // Build mock services with a shared tick state object so both the
    // GammaClient (getTrending) and ClobClient (getOrderBook) read the
    // same current-snapshot data without desynchronizing.
    const orderManager = new BacktestOrderManager(config.capitalUsdc);
    const tickState = createTickState(snapshots);
    const gammaClient = createHistoricalGammaClient(tickState);
    const mockClob = createMockClob(tickState);

    const deps: StrategyDeps = {
      clob: mockClob,
      orderManager,
      eventBus: { emit: () => {}, on: () => {}, off: () => {} },
      gamma: gammaClient,
    };

    const strategy = new (entry.ctor as StrategyConstructor)(
      deps,
      config.strategyConfig ?? entry.defaultConfig,
      config.strategy as StrategyName,
    );

    // Replay ticks - advance tick state before each execute so strategies
    // see fresh market data on every call.
    for (let tickIdx = 0; tickIdx < snapshots.length; tickIdx++) {
      const snapshot = snapshots[tickIdx];
      tickState.setCurrent(snapshot);

      try {
        await (strategy as BasePolymarketStrategy).execute();
      } catch (err) {
        logger.warn('Backtest tick error', 'BacktestRunner', {
          strategy: config.strategy,
          timestamp: snapshot.timestamp,
          err: String(err),
        });
      }

      // Record equity point
      orderManager.equityCurve.push({
        timestamp: snapshot.timestamp,
        equity: orderManager.getCurrentEquity(),
      });
    }

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
