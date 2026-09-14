/**
 * Funding Rate Store Queries
 *
 * Query helpers and row parsing for historical funding rates in PostgreSQL.
 */

import { getDbClient } from '../../db/postgres-client';
import type { DbFundingRateRow, FundingRateRow } from './funding-types';

export function parseFundingRateRow(row: DbFundingRateRow): FundingRateRow {
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

  return result.rows.map(parseFundingRateRow);
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

  return result.rows.map(parseFundingRateRow).reverse();
}

/**
 * Get count of stored funding rates for a symbol.
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
