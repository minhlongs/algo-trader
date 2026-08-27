/**
 * Backtest Data Loader
 *
 * Fetches historical data from the OHLCV store and runs the data quality
 * gate before conversion. Falls back to the live Gamma API when the store
 * has no data for the requested market/timeframe.
 */

import type { GammaMarket } from '../polymarket/gamma-client';
import { getHistoricalData, type OhlcvCandle } from '../data/ohlcv-store';
import { runDataQualityGate, timeframeToMs } from '../data/data-quality-gate';
import { logger } from '../../shared/utils/logger';
import type { DataQualityGateConfig, HistoricalSnapshot } from './types';
import type { GammaHistoricalProvider } from './gamma-historical-provider';

/**
 * Result of loading historical data for a backtest run.
 * `candles` is non-empty only when data came from the OHLCV store (used by
 * the run card to cite the data source); empty on live-API fallback.
 */
export interface LoadedHistoricalData {
  snapshots: HistoricalSnapshot[];
  candles: OhlcvCandle[];
}

/**
 * Fetch historical data from the OHLCV store instead of live Gamma API.
 * Converts stored candles into snapshot format compatible with backtest engine.
 *
 * Runs the data quality gate BEFORE conversion. Strict mode (default)
 * fails fast on any violation; non-strict mode records warnings only.
 */
export async function fetchFromOhlcvStore(
  historicalProvider: GammaHistoricalProvider,
  market: string,
  timeframe: string,
  days: number,
  qualityConfig?: DataQualityGateConfig,
  warnings: string[] = [],
): Promise<LoadedHistoricalData> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const candles = await getHistoricalData(market, timeframe, start, end);

  if (candles.length === 0) {
    logger.warn(
      `No OHLCV data for ${market}/${timeframe} in store, falling back to live API`,
      'BacktestRunner',
    );
    const snapshots = await historicalProvider.fetchHistoricalSnapshots(days);
    return { snapshots, candles: [] };
  }

  // ── Data quality gate (runs before any replay) ──────────────────────────
  const strict = qualityConfig?.strict ?? true;
  const report = runDataQualityGate(candles, {
    timeframeMs: qualityConfig?.timeframeMs ?? timeframeToMs(timeframe),
    priceJumpAtrMultiple: qualityConfig?.priceJumpAtrMultiple,
  });

  for (const w of report.warnings) {
    warnings.push(`[data-quality] ${w.code}: ${w.message}`);
  }

  if (!report.passed) {
    const summary = report.violations
      .slice(0, 5)
      .map((v) => `${v.code}@${v.index}`)
      .join(', ');
    if (strict) {
      throw new Error(
        `Data quality gate failed for ${market}/${timeframe}: ` +
        `${report.violations.length} violation(s) [${summary}] — ` +
        `backtest aborted before replay`,
      );
    }
    logger.warn(
      `Data quality gate reported ${report.violations.length} violation(s) ` +
      `[${summary}] but strict mode is off — continuing`,
      'BacktestRunner',
    );
    warnings.push(
      `[data-quality] gate failed with ${report.violations.length} violation(s) [${summary}] — strict mode off`,
    );
  }

  const snapshots = candles.map((candle: OhlcvCandle) => ({
    timestamp: candle.timestamp.toISOString(),
    markets: [{
      conditionId: market,
      question: market,
      slug: market,
      outcomes: ['Yes', 'No'],
      outcomePrices: [candle.close.toString(), (1 - candle.close).toString()],
      volume: candle.volume,
      liquidity: 0,
      endDate: candle.timestamp.toISOString(),
      active: false,
      closed: true,
      tokens: [
        { token_id: 'yes', outcome: 'Yes', price: candle.close },
        { token_id: 'no', outcome: 'No', price: 1 - candle.close },
      ],
      yesTokenId: 'yes',
      yesPrice: candle.close,
    } as unknown as GammaMarket],
  }));

  return { snapshots, candles };
}