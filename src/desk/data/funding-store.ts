/**
 * Funding Rate Store
 *
 * Persists and queries historical funding rate data from Binance Futures
 * in PostgreSQL. Supports bulk upserts and efficient range queries for
 * backtesting without live API dependency.
 * Types: ./funding-types (re-exported below for backward compat);
 * queries: ./funding-store-queries; quality validation: ./funding-quality.
 */

import type { PoolClient } from 'pg';
import { transaction } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { FundingRateRow, FundingStoreStats } from './funding-types';

export type { FundingRateRow, DbFundingRateRow, FundingStoreStats } from './funding-types';
export {
  getFundingRates,
  getLatestFundingRates,
  getFundingRateCount,
} from './funding-store-queries';

/**
 * Bulk insert funding rates — upserts on conflict.
 * Conflict target: (symbol, exchange, funding_time)
 */
export async function storeFundingRates(rates: FundingRateRow[]): Promise<FundingStoreStats> {
  if (rates.length === 0) {
    return { fetched: 0, stored: 0, inserted: 0, duplicatesSkipped: 0, oldest: null, newest: null };
  }

  const BATCH_SIZE = 500;

  // Sort by funding_time to get oldest/newest
  const sortedRates = [...rates].sort((a, b) => a.fundingTime.getTime() - b.fundingTime.getTime());
  const first = sortedRates[0];
  const last = sortedRates[sortedRates.length - 1];
  if (!first || !last) {
    return { fetched: 0, stored: 0, inserted: 0, duplicatesSkipped: 0, oldest: null, newest: null };
  }

  const oldest = first.fundingTime;
  const newest = last.fundingTime;
  if (sortedRates.some((r) => r.symbol !== first.symbol || r.exchange !== first.exchange)) {
    throw new Error(
      `storeFundingRates expects one symbol/exchange per call (got ${first.symbol}/${first.exchange} plus others); split calls per symbol`,
    );
  }
  const symbol = first.symbol;
  const exchange = first.exchange;

  const countInRange = async (client: PoolClient): Promise<number> => {
    const result = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text as cnt
       FROM funding_rates
       WHERE symbol = $1 AND exchange = $2
         AND funding_time >= $3 AND funding_time <= $4`,
      [symbol, exchange, oldest, newest],
    );
    return parseInt(result.rows[0]?.cnt ?? '0', 10);
  };

  const { stored, inserted } = await transaction(async (client) => {
    const oldCount = await countInRange(client);

    let upserted = 0;
    for (let i = 0; i < sortedRates.length; i += BATCH_SIZE) {
      const batch = sortedRates.slice(i, i + BATCH_SIZE);
      const values: (string | number | Date | null)[] = [];
      const placeholders: string[] = [];

      batch.forEach((rate, idx) => {
        const offset = idx * 8;
        placeholders.push(
          `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},` +
          `$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8})`,
        );
        values.push(
          rate.symbol,
          rate.exchange,
          rate.fundingTime,
          rate.fundingRate,
          rate.markPrice ?? null,
          rate.rateType ?? null,
          rate.retrievedAt,
          rate.sourceUrl,
        );
      });

      await client.query(
        `INSERT INTO funding_rates
           (symbol, exchange, funding_time, funding_rate, mark_price, rate_type, retrieved_at, source_url)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (symbol, exchange, funding_time) DO UPDATE SET
           funding_rate = EXCLUDED.funding_rate,
           mark_price = EXCLUDED.mark_price,
           rate_type = EXCLUDED.rate_type,
           retrieved_at = EXCLUDED.retrieved_at,
           source_url = EXCLUDED.source_url`,
        values,
      );

      upserted += batch.length;
    }

    const newCount = await countInRange(client);
    return { stored: upserted, inserted: newCount - oldCount };
  });

  const duplicatesSkipped = Math.max(0, rates.length - inserted);

  logger.info(
    `[FundingStore] Bulk upserted ${stored} funding rates (${duplicatesSkipped} duplicates skipped)`,
    'FundingStore',
  );

  return { fetched: rates.length, stored, inserted, duplicatesSkipped, oldest, newest };
}
