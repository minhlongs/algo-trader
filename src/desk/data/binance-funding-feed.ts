/**
 * Binance Futures Funding Rate Feed
 *
 * Fetches real funding rate history from the Binance Futures public API
 * and stores them in PostgreSQL via the FundingStore. No API key required
 * for the public fundingRate endpoint.
 *
 * Symbol mapping: repo uses "BTCUSDT" style for futures (same as Binance).
 *
 * Rate limits: Binance allows ~1200 request weight per minute for the
 * /fapi/v1/fundingRate endpoint. We batch sequentially with a small delay
 * to stay well under the ceiling.
 *
 * Flow:
 *   1. Use symbol directly as Binance futures symbol
 *   2. Fetch funding rates in 1000-event pages (max per request)
 *   3. Convert to FundingRateRow[]
 *   4. Bulk upsert into funding_rates
 *   5. Return stats
 */

import { storeFundingRates, type FundingRateRow, type FundingStoreStats } from '../data/funding-store';
import { logger } from '../../shared/utils/logger';

const BINANCE_FUNDING_API = 'https://fapi.binance.com/fapi/v1/fundingRate';
const EXCHANGE = 'binance-futures';
const MAX_PER_REQUEST = 1000; // Binance max per fundingRate request
const DELAY_MS = 250; // polite delay between paginated requests

/**
 * Binance fundingRate endpoint returns an array of objects:
 * [
 *   {
 *     "symbol": "BTCUSDT",
 *     "fundingTime": 1678540800000,
 *     "fundingRate": "0.0001",
 *     "markPrice": "23000.5",
 *     "rateType": "Regular"
 *   },
 *   ...
 * ]
 */
type BinanceFundingRate = {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
  markPrice?: string;
  rateType?: string;
};

/**
 * Convert a Binance funding rate object to a FundingRateRow.
 */
function fundingRateToRow(symbol: string, f: BinanceFundingRate, sourceUrl: string): FundingRateRow {
  return {
    symbol,
    exchange: EXCHANGE,
    fundingTime: new Date(f.fundingTime),
    fundingRate: parseFloat(f.fundingRate),
    markPrice: f.markPrice ? parseFloat(f.markPrice) : undefined,
    rateType: f.rateType,
    retrievedAt: new Date(),
    sourceUrl,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch one page of funding rates from Binance Futures.
 *
 * @param symbol     Binance futures symbol, e.g. "BTCUSDT"
 * @param startTime  Start time in milliseconds
 * @param endTime    End time in milliseconds
 * @param limit      Max number of records (max 1000)
 * @returns          Array of BinanceFundingRate objects
 */
async function fetchFundingRatePage(
  symbol: string,
  startTime: number,
  endTime: number,
  limit: number,
): Promise<BinanceFundingRate[]> {
  const url = new URL(BINANCE_FUNDING_API);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('startTime', String(startTime));
  url.searchParams.set('endTime', String(endTime));
  url.searchParams.set('limit', String(limit));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Binance Futures API error: ${resp.status} ${resp.statusText} for ${url}`);
  }
  return (await resp.json()) as BinanceFundingRate[];
}

/**
 * Parse function exported for unit testing with fixtures.
 * This allows tests to use committed JSON fixtures without hitting the network.
 */
export function parseFundingRateResponse(
  symbol: string,
  data: BinanceFundingRate[],
  sourceUrl: string,
): FundingRateRow[] {
  return data.map((f) => fundingRateToRow(symbol, f, sourceUrl));
}

/**
 * Fetch historical funding rates for a symbol and store them.
 *
 * @param symbol       Binance futures symbol, e.g. "BTCUSDT"
 * @param days         Number of days of history to fetch
 * @param onProgress   Optional callback reporting rates fetched so far
 * @returns            Number of funding rates stored
 */
export async function fetchBinanceFundingHistory(
  symbol: string,
  days: number,
  onProgress?: (fetched: number) => void,
): Promise<FundingStoreStats> {
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  logger.info(`[BinanceFundingFeed] Fetching ${days}d history for ${symbol}`);

  const allRates: FundingRateRow[] = [];
  let cursor = startTime;

  while (cursor < endTime) {
    const pageEnd = Math.min(cursor + MAX_PER_REQUEST * 8 * 60 * 60 * 1000, endTime);
    try {
      const fundingRates = await fetchFundingRatePage(symbol, cursor, pageEnd, MAX_PER_REQUEST);
      if (fundingRates.length === 0) {
        logger.debug(`[BinanceFundingFeed] Empty page at ${new Date(cursor).toISOString()}`);
      } else {
        const rows = parseFundingRateResponse(symbol, fundingRates, BINANCE_FUNDING_API);
        allRates.push(...rows);
        onProgress?.(allRates.length);
        logger.debug(
          `[BinanceFundingFeed] Page: ${fundingRates.length} rates, cursor ${new Date(cursor).toISOString()}`,
        );
      }
    } catch (err) {
      logger.error('[BinanceFundingFeed] Page fetch failed', {
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

  if (allRates.length === 0) {
    logger.warn(`[BinanceFundingFeed] No funding rates returned for ${symbol}`);
    return { fetched: 0, stored: 0, inserted: 0, duplicatesSkipped: 0, oldest: null, newest: null };
  }

  // Sort by fundingTime ascending
  allRates.sort((a, b) => a.fundingTime.getTime() - b.fundingTime.getTime());

  const stats = await storeFundingRates(allRates);
  logger.info(
    `[BinanceFundingFeed] Done: ${stats.stored} rates stored for ${symbol} (fetched ${stats.fetched})`,
  );
  return stats;
}

/**
 * CLI entry point.
 *
 * Usage: pnpm tsx src/desk/data/binance-funding-feed.ts <symbol> <days>
 *   e.g. pnpm tsx src/desk/data/binance-funding-feed.ts BTCUSDT 1460
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const symbol = args[0] ?? 'BTCUSDT';
  const days = parseInt(args[1] ?? '30', 10);

  fetchBinanceFundingHistory(symbol, days, (n) => {
    process.stdout.write(`\r[BinanceFundingFeed] Fetched ${n} rates...`);
  })
    .then((stats) => {
      process.stdout.write('\n');
      logger.info(
        `[BinanceFundingFeed] Done: stored=${stats.stored}, fetched=${stats.fetched}, ` +
          `oldest=${stats.oldest?.toISOString() ?? 'N/A'}, newest=${stats.newest?.toISOString() ?? 'N/A'}`,
      );
      process.exit(0);
    })
    .catch((err) => {
      process.stdout.write('\n');
      logger.error('[BinanceFundingFeed] Fatal', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}