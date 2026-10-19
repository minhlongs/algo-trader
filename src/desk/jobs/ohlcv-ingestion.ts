/**
 * OHLCV Ingestion Job
 *
 * Fetches current market data from Gamma API and stores as hourly candles
 * in PostgreSQL. Over time, builds up historical data for backtesting.
 *
 * Runs via PM2 cron (hourly) or manual invocation.
 *
 * Flow:
 *   1. Fetch active markets from Gamma API
 *   2. Get current prices for each market
 *   3. Store as 1-hour OHLCV candles (upsert on conflict)
 *   4. Log ingestion stats
 */

import { bulkInsertCandles } from '../data/ohlcv-store';
import { logger } from '../../shared/utils/logger';
import {
  GAMMA_API_BASE,
  TIMEFRAME,
  EXCHANGE,
  type GammaMarket,
  fetchActiveMarkets,
  truncateToHour,
  marketToCandle,
  marketsToCandles,
} from './ohlcv-ingestion-helpers';

export {
  GAMMA_API_BASE,
  TIMEFRAME,
  EXCHANGE,
  type GammaMarket,
  fetchActiveMarkets,
  truncateToHour,
  marketToCandle,
  marketsToCandles,
};

/**
 * Main ingestion function — fetch and store OHLCV data
 */
export async function ingestOhlcvData(): Promise<{ markets: number; candles: number }> {
  const startTime = Date.now();
  logger.info('[OhlcvIngestion] Starting hourly ingestion');

  try {
    // Fetch active markets
    const markets = await fetchActiveMarkets(100);
    logger.info(`[OhlcvIngestion] Fetched ${markets.length} active markets`);

    // Convert to candles
    const candles = marketsToCandles(markets);

    if (candles.length === 0) {
      logger.warn('[OhlcvIngestion] No valid candles to store');
      return { markets: markets.length, candles: 0 };
    }

    // Bulk insert to PostgreSQL
    const inserted = await bulkInsertCandles(candles);

    const elapsed = Date.now() - startTime;
    logger.info(`[OhlcvIngestion] Completed: ${inserted} candles from ${markets.length} markets in ${elapsed}ms`);

    return { markets: markets.length, candles: inserted };
  } catch (err) {
    logger.error('[OhlcvIngestion] Ingestion failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Start hourly ingestion loop (for PM2 or standalone execution)
 */
export function startOhlcvIngestion(intervalMs = 3_600_000): () => void {
  logger.info(`[OhlcvIngestion] Starting hourly loop (interval: ${intervalMs}ms)`);

  // Run immediately on start
  ingestOhlcvData().catch((err) => {
    logger.error('[OhlcvIngestion] Initial ingestion failed', { error: String(err) });
  });

  // Then run on interval
  const timer = setInterval(() => {
    ingestOhlcvData().catch((err) => {
      logger.error('[OhlcvIngestion] Scheduled ingestion failed', { error: String(err) });
    });
  }, intervalMs);

  return () => {
    logger.info('[OhlcvIngestion] Stopping hourly loop');
    clearInterval(timer);
  };
}

// CLI entry point
if (require.main === module) {
  ingestOhlcvData()
    .then((result) => {
      logger.info(`[OhlcvIngestion] Ingested ${result.candles} candles from ${result.markets} markets`);
      process.exit(0);
    })
    .catch((err) => {
      logger.error('[OhlcvIngestion] Ingestion failed', { err });
      process.exit(1);
    });
}
