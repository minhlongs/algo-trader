/**
 * Binance Historical Data Feed
 *
 * Fetches real OHLCV klines from the Binance public spot API and stores them
 * in PostgreSQL via the existing OhlcvStore. No API key required for public
 * klines endpoint — this is the same data Binance displays on its chart.
 *
 * Symbol mapping: repo uses "BTC/USD" style; Binance uses "BTCUSDT".
 * We keep the repo symbol as `market` and record `exchange = 'binance'`.
 *
 * Rate limits: Binance allows 1200 request weight per minute for the
 * /api/v3/klines endpoint (weight 1-100 depending on limit). We batch
 * sequentially with a small delay to stay well under the ceiling.
 *
 * Flow:
 *   1. Map repo symbol → Binance symbol
 *   2. Fetch klines in 500-candle pages (max per request)
 *   3. Convert to OhlcvCandle[]
 *   4. Bulk upsert into ohlcv_candles
 *   5. Return stats
 */

import { bulkInsertCandles, type OhlcvCandle } from '../data/ohlcv-store';
import { logger } from '../../shared/utils/logger';

const BINANCE_API = 'https://api.binance.com/api/v3/klines';
const TIMEFRAME = '1h';
const EXCHANGE = 'binance';
const MAX_PER_REQUEST = 500; // Binance max per klines request
const DELAY_MS = 250; // polite delay between paginated requests

/**
 * Binance klines endpoint returns an array of arrays, not objects:
 * [openTime, open, high, low, close, volume, closeTime, ...]
 */
type BinanceKline = [number, string, string, string, string, string, number, string, number, number, string, string];

/**
 * Map repo symbols (BTC/USD, ETH/USD, SOL/USD, AVAX/USD) to Binance symbols.
 * Returns null if no Binance listing exists for the symbol.
 */
export function toBinanceSymbol(symbol: string): string | null {
  const base = symbol.split('/')[0]?.toUpperCase();
  if (!base) return null;
  // AVAX not listed on Binance spot — skip
  if (base === 'AVAX') return null;
  return `${base}USDT`;
}

/**
 * Map repo symbol to Binance symbol, throwing if unavailable.
 */
function requireBinanceSymbol(symbol: string): string {
  const bs = toBinanceSymbol(symbol);
  if (!bs) {
    throw new Error(`No Binance spot listing for symbol: ${symbol}`);
  }
  return bs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch one page of klines from Binance.
 */
async function fetchKlinesPage(
  binanceSymbol: string,
  startTime: number,
  endTime: number,
  limit: number,
): Promise<BinanceKline[]> {
  const url = new URL(BINANCE_API);
  url.searchParams.set('symbol', binanceSymbol);
  url.searchParams.set('interval', TIMEFRAME);
  url.searchParams.set('startTime', String(startTime));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', String(limit));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Binance API error: ${resp.status} ${resp.statusText} for ${url}`);
  }
  return (await resp.json()) as BinanceKline[];
}

/**
 * Convert a Binance kline to an OhlcvCandle.
 */
function klineToCandle(symbol: string, k: BinanceKline): OhlcvCandle {
  return {
    market: symbol,
    exchange: EXCHANGE,
    timeframe: TIMEFRAME,
    timestamp: new Date(k[0]),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  };
}

/**
 * Fetch historical klines for a symbol and store them.
 *
 * @param symbol   Repo symbol, e.g. "BTC/USD"
 * @param days     Number of days of history to fetch (max ~700 days)
 * @param onProgress Optional callback reporting candles fetched so far
 * @returns Number of candles stored
 */
export async function fetchBinanceHistory(
  symbol: string,
  days: number,
  onProgress?: (fetched: number) => void,
): Promise<number> {
  const binanceSymbol = requireBinanceSymbol(symbol);
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  logger.info(`[BinanceFeed] Fetching ${days}d history for ${symbol} (${binanceSymbol})`);

  const candles: OhlcvCandle[] = [];
  let cursor = startTime;

  // Paginate: each request covers up to MAX_PER_REQUEST hours
  while (cursor < endTime) {
    const pageEnd = Math.min(cursor + MAX_PER_REQUEST * 60 * 60 * 1000, endTime);
    try {
      const klines = await fetchKlinesPage(binanceSymbol, cursor, pageEnd, MAX_PER_REQUEST);
      for (const k of klines) {
        candles.push(klineToCandle(symbol, k));
      }
      onProgress?.(candles.length);
      logger.debug(`[BinanceFeed] Page: ${klines.length} candles, cursor ${new Date(cursor).toISOString()}`);
    } catch (err) {
      logger.error('[BinanceFeed] Page fetch failed', {
        symbol,
        cursor: new Date(cursor).toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    cursor = pageEnd;
    if (cursor < endTime) {
      await sleep(DELAY_MS);
    }
  }

  if (candles.length === 0) {
    logger.warn(`[BinanceFeed] No candles returned for ${symbol}`);
    return 0;
  }

  // Sort by timestamp ascending (Binance may not guarantee order across pages)
  candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const stored = await bulkInsertCandles(candles);
  logger.info(`[BinanceFeed] Stored ${stored} candles for ${symbol} (${binanceSymbol})`);
  return stored;
}

/**
 * CLI entry point.
 *
 * Usage: pnpm tsx src/desk/data/binance-feed.ts <symbol> <days>
 *   e.g. pnpm tsx src/desk/data/binance-feed.ts BTC/USD 30
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const symbol = args[0] ?? 'BTC/USD';
  const days = parseInt(args[1] ?? '30', 10);

  fetchBinanceHistory(symbol, days, (n) => {
    process.stdout.write(`\r[BinanceFeed] Fetched ${n} candles...`);
  })
    .then((stored) => {
      process.stdout.write('\n');
      logger.info(`[BinanceFeed] Done: ${stored} candles stored for ${symbol}`);
      process.exit(0);
    })
    .catch((err) => {
      process.stdout.write('\n');
      logger.error('[BinanceFeed] Fatal', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}