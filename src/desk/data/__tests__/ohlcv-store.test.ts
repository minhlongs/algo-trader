/**
 * Tests for ohlcv-store — storeCandle, bulkInsertCandles, getHistoricalData,
 * getLatestCandles, getCandleCount. Db client is mocked; parseRow is
 * exercised indirectly through the query paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger, mockQuery } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  mockQuery: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../db/postgres-client', () => ({
  getDbClient: () => ({ query: mockQuery }),
}));

import { storeCandle, bulkInsertCandles, getHistoricalData, getLatestCandles, getCandleCount } from '../ohlcv-store';
import type { OhlcvCandle } from '../ohlcv-store';

function makeCandle(overrides: Partial<OhlcvCandle> = {}): OhlcvCandle {
  return {
    market: 'BTC-USD',
    exchange: 'polymarket',
    timeframe: '1h',
    timestamp: new Date('2026-01-01T00:00:00Z'),
    open: 100,
    high: 110,
    low: 95,
    close: 105,
    volume: 1000,
    ...overrides,
  };
}

describe('storeCandle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues an upsert for a single candle', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const candle = makeCandle();
    await storeCandle(candle);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO ohlcv_candles');
    expect(sql).toContain('ON CONFLICT');
    expect(params).toEqual([
      'BTC-USD', 'polymarket', '1h', candle.timestamp, 100, 110, 95, 105, 1000,
    ]);
  });
});

describe('bulkInsertCandles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 0 for an empty input without querying', async () => {
    expect(await bulkInsertCandles([])).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('inserts candles in 500-row batches and logs the aggregate', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 600 });
    const candles = Array.from({ length: 600 }, (_, i) => makeCandle({ open: i }));
    const inserted = await bulkInsertCandles(candles);
    expect(inserted).toBe(600);
    expect(mockQuery).toHaveBeenCalledTimes(2); // 600 / 500 -> two batches
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[OHLCV] Bulk inserted 600 candles'), 'OhlcvStore');
  });

  it('builds numbered placeholders for each batch', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });
    await bulkInsertCandles([makeCandle(), makeCandle()]);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('($1,$2,$3,$4,$5,$6,$7,$8,$9),($10,$11,$12,$13,$14,$15,$16,$17,$18)');
    expect(params).toHaveLength(18);
  });

  it('queries a single batch when under the batch size', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });
    await bulkInsertCandles([makeCandle(), makeCandle(), makeCandle()]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('getHistoricalData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries the range and maps rows to candles', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { market: 'BTC-USD', exchange: 'polymarket', timeframe: '1h', timestamp: new Date('2026-01-01'), open: '100', high: '110', low: '95', close: '105', volume: '1000' },
        { market: 'BTC-USD', exchange: 'polymarket', timeframe: '1h', timestamp: new Date('2026-01-02'), open: '101', high: '102', low: '99', close: '100', volume: '500' },
      ],
    });

    const rows = await getHistoricalData('BTC-USD', '1h', new Date('2026-01-01'), new Date('2026-01-31'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ market: 'BTC-USD', open: 100, close: 105, volume: 1000 });
    expect(rows[1]).toMatchObject({ open: 101, close: 100, volume: 500 });
    expect(mockQuery.mock.calls[0][1]).toEqual(['BTC-USD', '1h', 'polymarket', new Date('2026-01-01'), new Date('2026-01-31')]);
  });

  it('honors a custom exchange argument', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getHistoricalData('BTC-USD', '1h', new Date('2026-01-01'), new Date('2026-01-31'), 'binance');
    expect(mockQuery.mock.calls[0][1]).toEqual(['BTC-USD', '1h', 'binance', new Date('2026-01-01'), new Date('2026-01-31')]);
  });

  it('returns an empty array for no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getHistoricalData('BTC-USD', '1h', new Date('2026-01-01'), new Date('2026-01-31'))).toEqual([]);
  });
});

describe('getLatestCandles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the N most recent candles in ascending order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { market: 'BTC-USD', exchange: 'polymarket', timeframe: '1h', timestamp: new Date('2026-01-03'), open: '3', high: '4', low: '2', close: '3.5', volume: '300' },
        { market: 'BTC-USD', exchange: 'polymarket', timeframe: '1h', timestamp: new Date('2026-01-02'), open: '2', high: '3', low: '1', close: '2.5', volume: '200' },
      ],
    });
    const rows = await getLatestCandles('BTC-USD', '1h', 2);
    expect(rows).toHaveLength(2);
    // DESC query -> reversed to ascending
    expect(rows[0].timestamp.getTime()).toBeLessThan(rows[1].timestamp.getTime());
    expect(rows[0].close).toBe(2.5);
    expect(rows[1].close).toBe(3.5);
    expect(mockQuery.mock.calls[0][1]).toEqual(['BTC-USD', '1h', 'polymarket', 2]);
  });
});

describe('getCandleCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses the count row', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '127' }] });
    expect(await getCandleCount('BTC-USD', '1h')).toBe(127);
    expect(mockQuery.mock.calls[0][1]).toEqual(['BTC-USD', '1h', 'polymarket']);
  });

  it('returns 0 when no row is returned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await getCandleCount('BTC-USD', '1h')).toBe(0);
  });
});
