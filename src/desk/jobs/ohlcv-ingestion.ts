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

import { bulkInsertCandles, type OhlcvCandle } from '../data/ohlcv-store';
import { logger } from '../../shared/utils/logger';

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const TIMEFRAME = '1h';
const EXCHANGE = 'polymarket';

interface GammaMarket {
  id: string;
  question: string;
  outcomePrices: string; // JSON array of prices
  volume: string;
  liquidity: string;
}

/**
 * Fetch active markets from Gamma API
 */
async function fetchActiveMarkets(limit = 50): Promise<GammaMarket[]> {
  const url = `${GAMMA_API_BASE}/markets?limit=${limit}&active=true&closed=false`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Gamma API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<GammaMarket[]>;
}

/**
 * Parse Gamma market into OHLCV candle
 *
 * Gamma provides current outcomePrices (JSON array of yes/no prices).
 * We treat the yes price as "close" and derive OHLV from volume/liquidity.
 */
function marketToCandle(market: GammaMarket): OhlcvCandle | null {
  try {
    const prices = JSON.parse(market.outcomePrices) as number[];
    if (!prices || prices.length === 0) return null;

    const close = prices[0]; // yes price
    const volume = parseFloat(market.volume) || 0;
    const liquidity = parseFloat(market.liquidity) || 0;

    // Synthetic OHLV from current snapshot
    // In production, would use actual order book depth for H/L
    const spread = liquidity > 1000 ? 0.02 : 0.05; // tighter spread for liquid markets
    const high = Math.min(close + spread, 1.0);
    const low = Math.max(close - spread, 0.0);
    const open = close; // first tick of the hour

    return {
      market: market.id,
      exchange: EXCHANGE,
      timeframe: TIMEFRAME,
      timestamp: truncateToHour(new Date()),
      open,
      high,
      low,
      close,
      volume,
    };
  } catch {
    return null;
  }
}

/**
 * Truncate date to start of hour
 */
function truncateToHour(date: Date): Date {
  const truncated = new Date(date);
  truncated.setMinutes(0, 0, 0);
  return truncated;
}

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
    const candles: OhlcvCandle[] = [];
    for (const market of markets) {
      const candle = marketToCandle(market);
      if (candle) {
        candles.push(candle);
      }
    }

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
