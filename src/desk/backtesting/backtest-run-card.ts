/**
 * Backtest Run Card
 *
 * Builds and writes the provenance run card for a completed backtest run.
 * Fire-and-forget: writeRunCard is fail-safe (never throws), so a write
 * failure cannot lose the result. The card records the config hash +
 * result class for auditability.
 */

import { writeRunCard } from '../../alpha-lab/provenance/run-card';
import type { OhlcvCandle } from '../data/ohlcv-store';
import type { BacktestResult, BacktestRunnerOptions } from './types';

/**
 * Write a provenance run card for a completed backtest run.
 *
 * `ohlcvCandles` is non-empty when the run replayed OHLCV-store data —
 * the card then cites the store as its data source. When empty, the run
 * replayed live Gamma API snapshots and the card cites gamma.
 */
export function writeBacktestRunCard(
  config: BacktestRunnerOptions,
  result: BacktestResult,
  ohlcvCandles: OhlcvCandle[],
): void {
  if (!config.runCardDir) return;

  const start = new Date(result.startedAt).toISOString();
  const end = new Date(result.completedAt).toISOString();

  const dataSources = ohlcvCandles.length > 0
    ? [{
        provider: 'ohlcv-store',
        symbol: ohlcvCandles[0].market,
        timeframe: ohlcvCandles[0].timeframe,
        start,
        end,
        retrievedAt: result.completedAt,
        candleCount: ohlcvCandles.length,
      }]
    : [{
        provider: 'gamma',
        symbol: config.strategy,
        timeframe: String(config.tickIntervalMs ?? 3_600_000),
        start,
        end,
        retrievedAt: result.completedAt,
        candleCount: result.equityCurve.length,
      }];

  void writeRunCard(config.runCardDir, {
    runId: `${config.strategy}-${result.startedAt}`,
    resultClass: config.resultClass ?? 'PAPER',
    strategyRef: config.strategy,
    dataSources,
    metrics: {
      totalPnl: result.metrics.totalPnl,
      sharpeRatio: result.metrics.sharpeRatio,
      maxDrawdown: result.metrics.maxDrawdown,
      winRate: result.metrics.winRate,
      tradeCount: result.metrics.totalTrades,
      durationMs: result.durationMs,
    },
    config: config as unknown as Record<string, unknown>,
    warnings: result.warnings,
  });
}
