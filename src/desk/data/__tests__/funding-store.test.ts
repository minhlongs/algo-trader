/**
 * Funding Store Tests
 *
 * Real DB tests following existing desk data pattern — targets the local
 * Postgres defaults of src/db/postgres-client.ts (DB_HOST/DB_PORT/DB_NAME env
 * overrides). DATABASE_URL merely gates whether the suite runs: without it
 * the whole suite is skipped (e.g. in CI, which has no Postgres).
 * Tests upsert idempotency and data integrity.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  storeFundingRates,
  getFundingRates,
  getLatestFundingRates,
  getFundingRateCount,
  validateFundingQuality,
  type FundingRateRow,
} from '../funding-store';
import { getDbClient } from '../../../db/postgres-client';

const TEST_SYMBOL = 'TESTBTCUSDT';
const EXCHANGE = 'binance-futures';

function makeRate(i: number, baseTime = Date.now() - 8 * 60 * 60 * 1000 * 100): FundingRateRow {
  return {
    symbol: TEST_SYMBOL,
    exchange: EXCHANGE,
    fundingTime: new Date(baseTime + i * 8 * 60 * 60 * 1000),
    fundingRate: 0.0001 + i * 0.00001,
    markPrice: 50000 + i * 100,
    rateType: 'Regular',
    retrievedAt: new Date(),
    sourceUrl: 'https://fapi.binance.com/fapi/v1/fundingRate',
  };
}

describe.skipIf(!process.env.DATABASE_URL)('funding-store (real DB)', () => {
  const pool = getDbClient();

  beforeAll(async () => {
    // Clean up any existing test data
    await pool.query('DELETE FROM funding_rates WHERE symbol = $1 AND exchange = $2', [TEST_SYMBOL, EXCHANGE]);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM funding_rates WHERE symbol = $1 AND exchange = $2', [TEST_SYMBOL, EXCHANGE]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM funding_rates WHERE symbol = $1 AND exchange = $2', [TEST_SYMBOL, EXCHANGE]);
  });

  it('stores funding rates and returns correct stats', async () => {
    const rates = Array.from({ length: 10 }, (_, i) => makeRate(i));
    const stats = await storeFundingRates(rates);

    expect(stats.fetched).toBe(10);
    expect(stats.stored).toBe(10);
    expect(stats.oldest).toBeInstanceOf(Date);
    expect(stats.newest).toBeInstanceOf(Date);
    expect(stats.oldest!.getTime()).toBe(rates[0].fundingTime.getTime());
    expect(stats.newest!.getTime()).toBe(rates[9].fundingTime.getTime());
  });

  it('upsert is idempotent — rerun produces duplicatesSkipped', async () => {
    const rates = Array.from({ length: 5 }, (_, i) => makeRate(i));

    // First insert
    const stats1 = await storeFundingRates(rates);
    expect(stats1.stored).toBe(5);
    expect(stats1.inserted).toBe(5);
    expect(stats1.duplicatesSkipped).toBe(0);

    // Second insert (same data)
    const stats2 = await storeFundingRates(rates);
    expect(stats2.stored).toBe(5);
    expect(stats2.inserted).toBe(0);
    expect(stats2.duplicatesSkipped).toBe(5);
    // Count in DB should still be 5
    const count = await getFundingRateCount(TEST_SYMBOL, EXCHANGE);
    expect(count).toBe(5);
  });

  it('partial overlap counts only pre-existing rows as duplicates', async () => {
    const existing = Array.from({ length: 5 }, (_, i) => makeRate(i));
    await storeFundingRates(existing);

    const overlap = [
      ...existing.slice(0, 2),
      ...Array.from({ length: 3 }, (_, i) => makeRate(5 + i)),
    ];
    const stats = await storeFundingRates(overlap);
    expect(stats.fetched).toBe(5);
    expect(stats.stored).toBe(5);
    expect(stats.inserted).toBe(3);
    expect(stats.duplicatesSkipped).toBe(2);
  });

  it('rejects mixed symbols in a single call', async () => {
    const mixed = [makeRate(0), { ...makeRate(1), symbol: 'TESTETHUSDT' }];
    await expect(storeFundingRates(mixed)).rejects.toThrow(/one symbol\/exchange/);
  });

  it('retrieves funding rates in time order', async () => {
    const rates = Array.from({ length: 5 }, (_, i) => makeRate(i));
    await storeFundingRates(rates);

    const retrieved = await getFundingRates(TEST_SYMBOL, rates[0].fundingTime, rates[4].fundingTime, EXCHANGE);
    expect(retrieved).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(retrieved[i].fundingRate).toBeCloseTo(rates[i].fundingRate, 6);
      expect(retrieved[i].fundingTime.getTime()).toBe(rates[i].fundingTime.getTime());
    }
  });

  it('getLatestFundingRates returns most recent N rates', async () => {
    const rates = Array.from({ length: 10 }, (_, i) => makeRate(i));
    await storeFundingRates(rates);

    const latest = await getLatestFundingRates(TEST_SYMBOL, 3, EXCHANGE);
    expect(latest).toHaveLength(3);
    // Should be the last 3 in chronological order
    expect(latest[0].fundingTime.getTime()).toBe(rates[7].fundingTime.getTime());
    expect(latest[2].fundingTime.getTime()).toBe(rates[9].fundingTime.getTime());
  });

  it('handles empty range gracefully', async () => {
    const empty = await getFundingRates(
      TEST_SYMBOL,
      new Date('2020-01-01'),
      new Date('2020-01-02'),
      EXCHANGE,
    );
    expect(empty).toHaveLength(0);

    const count = await getFundingRateCount(TEST_SYMBOL, EXCHANGE);
    expect(count).toBe(0);
  });

  it('validateFundingQuality detects anomalies', async () => {
    const rates = [
      makeRate(0, Date.UTC(2024, 0, 1)),
      makeRate(1, Date.UTC(2024, 0, 1)),
      // Add an anomaly: rate > 1%
      { ...makeRate(2, Date.UTC(2024, 0, 1)), fundingRate: 0.02 },
      // Add a gap: next rate 24h later instead of 8h
      { ...makeRate(4, Date.UTC(2024, 0, 1)), fundingRate: 0.0001 },
    ];
    await storeFundingRates(rates);

    const quality = await validateFundingQuality(TEST_SYMBOL, EXCHANGE);
    expect(quality.totalRows).toBe(4);
    expect(quality.rateAnomalies).toBe(1);
    expect(quality.coverageGaps).toBe(1);
    expect(quality.duplicateCount).toBe(0);
    expect(quality.monotonicViolations).toBe(0);
  });

  it('validateFundingQuality reports zero duplicates', async () => {
    const rates = Array.from({ length: 5 }, (_, i) => makeRate(i));
    await storeFundingRates(rates);
    await storeFundingRates(rates); // duplicate insert

    const quality = await validateFundingQuality(TEST_SYMBOL, EXCHANGE);
    expect(quality.totalRows).toBe(5);
    expect(quality.duplicateCount).toBe(0); // unique index prevents duplicates
    expect(quality.monotonicViolations).toBe(0);
  });

  it('handles negative funding rates correctly', async () => {
    // Real negative rate from March-April 2020: -0.0004868
    const negativeRate: FundingRateRow = {
      symbol: TEST_SYMBOL,
      exchange: EXCHANGE,
      fundingTime: new Date('2020-03-20T08:00:00Z'),
      fundingRate: -0.0004868,
      markPrice: 6000,
      rateType: 'Regular',
      retrievedAt: new Date(),
      sourceUrl: 'https://fapi.binance.com/fapi/v1/fundingRate',
    };
    await storeFundingRates([negativeRate]);

    const retrieved = await getFundingRates(
      TEST_SYMBOL,
      new Date('2020-03-19'),
      new Date('2020-03-21'),
      EXCHANGE,
    );
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].fundingRate).toBe(-0.0004868);
  });
});