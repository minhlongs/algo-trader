/**
 * Funding Rate Store
 *
 * Persists and queries historical funding rate data from Binance Futures
 * in PostgreSQL. Supports bulk upserts and efficient range queries for
 * backtesting without live API dependency.
 * Types: ./funding-types (re-exported below for backward compat);
 * quality validation: ./funding-quality.
 */

import type { PoolClient } from 'pg';
import { getDbClient, transaction } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { DbFundingRateRow, FundingRateRow, FundingStoreStats } from './funding-types';

export type { FundingRateRow, DbFundingRateRow, FundingStoreStats } from './funding-types';

/**
 * Bulk insert funding rates — upserts on conflict.
 * Conflict target: (symbol, exchange, funding_time)
 *
 * `ON CONFLICT DO UPDATE` reports every row as affected, so the real insert
 * count is derived from a count-before/count-after delta scoped to the
 * symbol/exchange/time range. Both counts and all upsert batches run on one
 * connection inside a single transaction so the delta always includes this
 * call's own writes; a foreign writer committing in-range rows mid-call can
 * only shift the split between inserted/duplicatesSkipped, never lose rows.
 * `duplicatesSkipped` = input rows that already existed and were re-upserted.
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
  // All rates in one call must share a symbol/exchange — the count delta below
  // is scoped to first.symbol/first.exchange, so a mixed call would silently
  // misreport duplicatesSkipped.
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

  // Rows that did not increase the table count were existing rows re-upserted.
  const duplicatesSkipped = Math.max(0, rates.length - inserted);

  logger.info(
    `[FundingStore] Bulk upserted ${stored} funding rates (${duplicatesSkipped} duplicates skipped)`,
    'FundingStore',
  );

  return { fetched: rates.length, stored, inserted, duplicatesSkipped, oldest, newest };
}

/**
 * Get historical funding rates for a symbol within a date range
 */
export async function getFundingRates(
  symbol: string,
  start: Date,
  end: Date,
  exchange = 'binance-futures',
): Promise<FundingRateRow[]> {
  const pool = getDbClient();
  const result = await pool.query<DbFundingRateRow>(
    `SELECT symbol, exchange, funding_time, funding_rate, mark_price, rate_type, retrieved_at, source_url
     FROM funding_rates
     WHERE symbol = $1 AND exchange = $2
       AND funding_time >= $3 AND funding_time <= $4
     ORDER BY funding_time ASC`,
    [symbol, exchange, start, end],
  );

  return result.rows.map(parseRow);
}

/**
 * Get the latest N funding rates for a symbol
 */
export async function getLatestFundingRates(
  symbol: string,
  limit: number,
  exchange = 'binance-futures',
): Promise<FundingRateRow[]> {
  const pool = getDbClient();
  const result = await pool.query<DbFundingRateRow>(
    `SELECT symbol, exchange, funding_time, funding_rate, mark_price, rate_type, retrieved_at, source_url
     FROM funding_rates
     WHERE symbol = $1 AND exchange = $2
     ORDER BY funding_time DESC
     LIMIT $3`,
    [symbol, exchange, limit],
  );

  return result.rows.map(parseRow).reverse();
}

/**
 * Get count of stored funding rates for a symbol.
 *
 * Point-in-time count read via the shared pool: concurrent inserts between
 * this query and any later use of the value are possible, which is acceptable
 * for stats/monitoring.
 */
export async function getFundingRateCount(
  symbol: string,
  exchange = 'binance-futures',
): Promise<number> {
  const result = await getDbClient().query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM funding_rates
     WHERE symbol = $1 AND exchange = $2`,
    [symbol, exchange],
  );
  return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

function parseRow(row: DbFundingRateRow): FundingRateRow {
  return {
    symbol: row.symbol,
    exchange: row.exchange,
    fundingTime: row.funding_time,
    fundingRate: parseFloat(row.funding_rate),
    markPrice: row.mark_price ? parseFloat(row.mark_price) : undefined,
    rateType: row.rate_type ?? undefined,
    retrievedAt: row.retrieved_at,
    sourceUrl: row.source_url,
  };
}