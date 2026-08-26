/**
 * Funding Rate Quality Validation
 *
 * Read-only data-quality checks over the funding_rates table: duplicates,
 * monotonic violations, rate anomalies, and 8h-cadence coverage gaps.
 * Split out of funding-store.ts so the store module stays focused on
 * upsert/read. Behavior is unchanged from the original implementation.
 */

import { getDbClient } from '../../db/postgres-client';

/**
 * Validate funding rate data quality
 */
export interface FundingQualityReport {
  totalRows: number;
  duplicateCount: number;
  monotonicViolations: number;
  rateAnomalies: number; // |rate| > 1% (10000 bps)
  coverageGaps: number; // Expected 8h cadence gaps
  oldest: Date | null;
  newest: Date | null;
}

export async function validateFundingQuality(
  symbol: string,
  exchange = 'binance-futures',
): Promise<FundingQualityReport> {
  const pool = getDbClient();

  // Total rows
  const totalResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt FROM funding_rates WHERE symbol = $1 AND exchange = $2`,
    [symbol, exchange],
  );
  const totalRows = parseInt(totalResult.rows[0]?.cnt ?? '0', 10);

  // Duplicate count (should be 0 due to unique index, but check anyway)
  const dupResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM (
       SELECT symbol, exchange, funding_time, COUNT(*)
       FROM funding_rates
       WHERE symbol = $1 AND exchange = $2
       GROUP BY symbol, exchange, funding_time
       HAVING COUNT(*) > 1
     ) d`,
    [symbol, exchange],
  );
  const duplicateCount = parseInt(dupResult.rows[0]?.cnt ?? '0', 10);

  // Monotonic violations: funding_time not strictly increasing
  const monoResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM (
       SELECT funding_time,
              LAG(funding_time) OVER (ORDER BY funding_time) as prev_time
       FROM funding_rates
       WHERE symbol = $1 AND exchange = $2
     ) m
     WHERE prev_time IS NOT NULL AND funding_time <= prev_time`,
    [symbol, exchange],
  );
  const monotonicViolations = parseInt(monoResult.rows[0]?.cnt ?? '0', 10);

  // Rate anomalies: |funding_rate| > 0.01 (1%)
  const anomalyResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM funding_rates
     WHERE symbol = $1 AND exchange = $2
       AND ABS(funding_rate) > 0.01`,
    [symbol, exchange],
  );
  const rateAnomalies = parseInt(anomalyResult.rows[0]?.cnt ?? '0', 10);

  // Coverage gaps: expected 8h cadence
  // 8 hours = 28800000 ms
  const gapResult = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM (
       SELECT funding_time,
              LAG(funding_time) OVER (ORDER BY funding_time) as prev_time
       FROM funding_rates
       WHERE symbol = $1 AND exchange = $2
     ) g
     WHERE prev_time IS NOT NULL
       AND EXTRACT(EPOCH FROM (funding_time - prev_time)) * 1000 > 28800000 * 1.5`,
    [symbol, exchange],
  );
  const coverageGaps = parseInt(gapResult.rows[0]?.cnt ?? '0', 10);

  // Oldest/newest
  const rangeResult = await pool.query<{ min: Date | null; max: Date | null }>(
    `SELECT MIN(funding_time) as min, MAX(funding_time) as max
     FROM funding_rates WHERE symbol = $1 AND exchange = $2`,
    [symbol, exchange],
  );

  return {
    totalRows,
    duplicateCount,
    monotonicViolations,
    rateAnomalies,
    coverageGaps,
    oldest: rangeResult.rows[0]?.min ?? null,
    newest: rangeResult.rows[0]?.max ?? null,
  };
}
