/**
 * Funding Store Tests (in-memory)
 *
 * The real funding-store.test.ts is gated behind DATABASE_URL and skipped
 * in CI, so its 47 statements show as 0% coverage. This suite drives the same
 * code paths against an in-memory fake of src/db/postgres-client so the
 * upsert/duplicate/query/transaction logic is exercised without Postgres.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeFundingRates, getFundingRates, getLatestFundingRates, getFundingRateCount } from '../../../../src/desk/data/funding-store';
import type { FundingRateRow } from '../../../../src/desk/data/funding-types';

const { mockQuery, mockTransaction, fundingRows, mockPool } = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = [];

  const findExisting = (symbol: string, exchange: string, fundingTime: Date) =>
    rows.findIndex(
      (r) =>
        r.symbol === symbol &&
        r.exchange === exchange &&
        new Date(r.funding_time as string).getTime() === fundingTime.getTime(),
    );

  const query = vi.fn(async (text: string, params?: unknown[]) => {
    if (text.includes('SELECT COUNT(*)')) {
      let counted = rows.slice();
      if (params && params.length >= 2) {
        const [symbol, exchange] = params as [string, string];
        counted = counted.filter((r) => r.symbol === symbol && r.exchange === exchange);
        if (params.length >= 4) {
          const [, , start, end] = params as [string, string, Date, Date];
          const st = new Date(start).getTime();
          const en = new Date(end).getTime();
          counted = counted.filter(
            (r) => new Date(r.funding_time as string).getTime() >= st && new Date(r.funding_time as string).getTime() <= en,
          );
        }
      }
      return { rows: [{ cnt: String(counted.length) }] };
    }

    if (text.includes('INSERT INTO funding_rates')) {
      const vals = params ?? [];
      let inserted = 0;
      for (let i = 0; i < vals.length; i += 8) {
        const ft = vals[i + 2] as Date;
        const idx = findExisting(String(vals[i]), String(vals[i + 1]), ft);
        const row = {
          symbol: vals[i],
          exchange: vals[i + 1],
          funding_time: ft,
          funding_rate: String(vals[i + 3]),
          mark_price: vals[i + 4] != null ? String(vals[i + 4]) : null,
          rate_type: (vals[i + 5] as string | null) ?? null,
          retrieved_at: vals[i + 6],
          source_url: vals[i + 7],
        };
        if (idx >= 0) rows[idx] = row;
        else rows.push(row);
        inserted++;
      }
      return { rows: [], rowCount: inserted };
    }

    if (text.includes('FROM funding_rates')) {
      let result = rows.slice();
      if (params) {
        if (params.length === 2) {
          const [symbol, exchange] = params as [string, string];
          result = result.filter((r) => r.symbol === symbol && r.exchange === exchange);
        } else if (params.length === 4) {
          const [symbol, exchange, start, end] = params as [string, string, Date, Date];
          const st = new Date(start).getTime();
          const en = new Date(end).getTime();
          result = result
            .filter(
              (r) =>
                r.symbol === symbol &&
                r.exchange === exchange &&
                new Date(r.funding_time as string).getTime() >= st &&
                new Date(r.funding_time as string).getTime() <= en,
            )
            .sort((a, b) => new Date(a.funding_time as string).getTime() - new Date(b.funding_time as string).getTime());
        } else if (params.length === 3 && text.includes('ORDER BY funding_time DESC')) {
          const [symbol, exchange, limit] = params as [string, string, number];
          result = result
            .filter((r) => r.symbol === symbol && r.exchange === exchange)
            .sort((a, b) => new Date(b.funding_time as string).getTime() - new Date(a.funding_time as string).getTime())
            .slice(0, limit);
        }
      }
      return { rows: result };
    }

    return { rows: [] };
  });

  const client = { query, release: vi.fn() };
  const pool = { connect: () => client, query, end: vi.fn() };

  const transaction = vi.fn(async (fn: (c: typeof client) => Promise<unknown>) => {
    try {
      await query('BEGIN');
      const result = await fn(client);
      await query('COMMIT');
      return result;
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  return { mockQuery: query, mockTransaction: transaction, fundingRows: rows, mockPool: pool };
});

vi.mock('../../../../src/db/postgres-client', () => ({
  getDbClient: () => mockPool,
  query: mockQuery,
  transaction: mockTransaction,
  closeDbConnection: vi.fn(),
}));

import { getDbClient } from '../../../../src/db/postgres-client';

const EXCHANGE = 'binance-futures';

function makeRate(i: number, baseTime = Date.now()): FundingRateRow {
  return {
    symbol: 'BTCUSDT',
    exchange: EXCHANGE,
    fundingTime: new Date(baseTime + i * 8 * 60 * 60 * 1000),
    fundingRate: 0.0001 + i * 0.00001,
    markPrice: 50000 + i * 100,
    rateType: 'Regular',
    retrievedAt: new Date(),
    sourceUrl: 'https://fapi.binance.com/fapi/v1/fundingRate',
  };
}

describe('storeFundingRates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fundingRows.length = 0;
  });

  it('returns zeroed stats for an empty input', async () => {
    const stats = await storeFundingRates([]);
    expect(stats).toEqual({ fetched: 0, stored: 0, inserted: 0, duplicatesSkipped: 0, oldest: null, newest: null });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('throws when a single call mixes symbols', async () => {
    const mixed = [makeRate(0), { ...makeRate(1), symbol: 'ETHUSDT' }];
    await expect(storeFundingRates(mixed)).rejects.toThrow(/one symbol\/exchange/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('stores rates and reports oldest/newest from the sorted range', async () => {
    const rates = [makeRate(2), makeRate(0), makeRate(1)];
    const stats = await storeFundingRates(rates);
    expect(stats.fetched).toBe(3);
    expect(stats.stored).toBe(3);
    expect(stats.inserted).toBe(3);
    expect(stats.duplicatesSkipped).toBe(0);
    // input is deliberately unsorted: [t+16h, t, t+8h]
    expect(stats.oldest!.getTime()).toBe(rates[1].fundingTime.getTime());
    expect(stats.newest!.getTime()).toBe(rates[0].fundingTime.getTime());
  });

  it('marks re-upserted rows as duplicates', async () => {
    const rates = Array.from({ length: 5 }, (_, i) => makeRate(i));
    await storeFundingRates(rates);
    const again = await storeFundingRates(rates);
    expect(again.stored).toBe(5);
    expect(again.inserted).toBe(0);
    expect(again.duplicatesSkipped).toBe(5);
    expect(await getFundingRateCount('BTCUSDT')).toBe(5);
  });

  it('counts only pre-existing rows as duplicates on partial overlap', async () => {
    await storeFundingRates(Array.from({ length: 5 }, (_, i) => makeRate(i)));
    const overlap = [...Array.from({ length: 2 }, (_, i) => makeRate(i)), ...Array.from({ length: 3 }, (_, i) => makeRate(5 + i))];
    const stats = await storeFundingRates(overlap);
    expect(stats.inserted).toBe(3);
    expect(stats.duplicatesSkipped).toBe(2);
  });

  it('rolls back the whole transaction when a batch insert fails', async () => {
    mockQuery.mockImplementationOnce(async () => { throw new Error('insert failed'); });
    await expect(storeFundingRates(Array.from({ length: 3 }, (_, i) => makeRate(i)))).rejects.toThrow('insert failed');
    expect(fundingRows).toHaveLength(0);
  });
});

describe('getFundingRates / getLatestFundingRates / getFundingRateCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fundingRows.length = 0;
  });

  it('returns rows in chronological order within a range', async () => {
    const rates = Array.from({ length: 5 }, (_, i) => makeRate(i));
    await storeFundingRates(rates);
    const rows = await getFundingRates('BTCUSDT', rates[0].fundingTime, rates[4].fundingTime);
    expect(rows).toHaveLength(5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].fundingTime.getTime()).toBeGreaterThan(rows[i - 1].fundingTime.getTime());
    }
  });

  it('returns an empty array when the range matches nothing', async () => {
    const rows = await getFundingRates('BTCUSDT', new Date('2000-01-01'), new Date('2000-01-02'));
    expect(rows).toHaveLength(0);
  });

  it('returns the most recent N rates in chronological order', async () => {
    await storeFundingRates(Array.from({ length: 10 }, (_, i) => makeRate(i)));
    const latest = await getLatestFundingRates('BTCUSDT', 3);
    expect(latest).toHaveLength(3);
    // fundingRate = 0.0001 + i*0.00001; the 3 newest of i=0..9 are i=7,8,9
    expect(latest[0].fundingRate).toBeCloseTo(0.00017, 6);
    expect(latest[1].fundingRate).toBeCloseTo(0.00018, 6);
    expect(latest[2].fundingRate).toBeCloseTo(0.00019, 6);
  });

  it('reports the count of stored rows for a symbol', async () => {
    await storeFundingRates(Array.from({ length: 4 }, (_, i) => makeRate(i)));
    expect(await getFundingRateCount('BTCUSDT')).toBe(4);
    expect(await getFundingRateCount('ETHUSDT')).toBe(0);
  });

  it('parses optional fields as undefined when the row value is null', async () => {
    const rate: FundingRateRow = {
      symbol: 'BTCUSDT',
      exchange: EXCHANGE,
      fundingTime: new Date(),
      fundingRate: -0.0004868,
      retrievedAt: new Date(),
      sourceUrl: 'https://fapi.binance.com/fapi/v1/fundingRate',
    };
    await storeFundingRates([rate]);
    const rows = await getFundingRates('BTCUSDT', rate.fundingTime, rate.fundingTime);
    expect(rows[0].markPrice).toBeUndefined();
    expect(rows[0].rateType).toBeUndefined();
    expect(rows[0].fundingRate).toBe(-0.0004868);
  });
});
