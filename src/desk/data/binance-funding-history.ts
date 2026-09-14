import { storeFundingRates } from './funding-store';
import type { FundingRateRow, FundingStoreStats } from './funding-types';
import { logger } from '../../shared/utils/logger';
import {
  BINANCE_FUNDING_API,
  MAX_PER_REQUEST,
  DELAY_MS,
  type BinanceFundingRate,
  sleep,
} from './binance-funding-types';
import { parseFundingRateResponse } from './binance-funding-parser';

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
