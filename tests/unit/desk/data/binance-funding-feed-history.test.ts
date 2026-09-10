/**
 * Tests for binance-funding-feed — fetchBinanceFundingHistory pagination,
 * error handling, and store handoff. Global fetch and storeFundingRates are
 * mocked; no network or DB access. Parser fixtures live in the sibling
 * binance-funding-feed.test.ts suite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const storeFundingRatesMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/desk/data/funding-store', () => ({
  storeFundingRates: storeFundingRatesMock,
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchBinanceFundingHistory } from '../../../../src/desk/data/binance-funding-feed';
import { logger } from '../../../../src/shared/utils/logger';
import type { FundingRateRow } from '../../../../src/desk/data/funding-types';

const BINANCE_FUNDING_API = 'https://fapi.binance.com/fapi/v1/fundingRate';
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_WINDOW_MS = 1000 * 8 * 60 * 60 * 1000; // MAX_PER_REQUEST * 8h ≈ 333 days

type BinanceFundingRate = {
  symbol: string;
  fundingTime: number;
  fundingRate: string;
  markPrice?: string;
  rateType?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
  });
}

function binanceRate(fundingTime: number, rate = '0.0001'): BinanceFundingRate {
  return { symbol: 'BTCUSDT', fundingTime, fundingRate: rate };
}

/** Parse the four query params we care about out of a funding API URL. */
function parseFundingUrl(url: string): { symbol: string; startTime: number; endTime: number; limit: number } {
  const u = new URL(url);
  return {
    symbol: u.searchParams.get('symbol')!,
    startTime: Number(u.searchParams.get('startTime')),
    endTime: Number(u.searchParams.get('endTime')),
    limit: Number(u.searchParams.get('limit')),
  };
}

const ZERO_STATS = {
  fetched: 0,
  stored: 0,
  inserted: 0,
  duplicatesSkipped: 0,
  oldest: null,
  newest: null,
};

describe('fetchBinanceFundingHistory (mocked fetch + store)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let pageResponses: Response[];

  beforeEach(() => {
    storeFundingRatesMock.mockReset();
    pageResponses = [];
    fetchMock = vi.fn((_input: unknown) => {
      const next = pageResponses.shift();
      return Promise.resolve(next ?? jsonResponse([]));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches a single page and hands sorted rows to the store', async () => {
    pageResponses.push(jsonResponse([binanceRate(5000), binanceRate(1000, '0.0002')]));
    const stats = {
      fetched: 2,
      stored: 2,
      inserted: 2,
      duplicatesSkipped: 0,
      oldest: new Date(1000),
      newest: new Date(5000),
    };
    storeFundingRatesMock.mockResolvedValue(stats);

    const before = Date.now();
    const result = await fetchBinanceFundingHistory('BTCUSDT', 30);
    const after = Date.now();

    expect(result).toEqual(stats);
    // 30 days fits in one pagination window (1000 * 8h ≈ 333 days)
    expect(fetchMock).toHaveBeenCalledOnce();
    const params = parseFundingUrl(fetchMock.mock.calls[0]![0] as string);
    expect(params.symbol).toBe('BTCUSDT');
    expect(params.limit).toBe(1000);
    // startTime ≈ now - 30d, endTime ≈ now
    expect(params.startTime).toBeGreaterThanOrEqual(before - 30 * DAY_MS - 1000);
    expect(params.startTime).toBeLessThanOrEqual(after - 30 * DAY_MS + 1000);
    expect(params.endTime).toBeGreaterThanOrEqual(before - 1000);
    expect(params.endTime).toBeLessThanOrEqual(after + 1000);

    expect(storeFundingRatesMock).toHaveBeenCalledOnce();
    const rows = storeFundingRatesMock.mock.calls[0]![0] as FundingRateRow[];
    expect(rows).toHaveLength(2);
    // Sorted ascending by fundingTime regardless of arrival order
    expect(rows[0].fundingTime.getTime()).toBe(1000);
    expect(rows[1].fundingTime.getTime()).toBe(5000);
    expect(rows[0].exchange).toBe('binance-futures');
    expect(rows[0].symbol).toBe('BTCUSDT');
    expect(rows[0].sourceUrl).toBe(BINANCE_FUNDING_API);
    expect(rows[0].fundingRate).toBe(0.0002);
    expect(rows[0].retrievedAt).toBeInstanceOf(Date);
  });

  it('paginates across multiple windows and reports cumulative progress', async () => {
    // 500 days spans exactly two windows (333.3 days per window)
    pageResponses.push(
      jsonResponse([binanceRate(9000 * 60 * 60 * 1000), binanceRate(16000 * 60 * 60 * 1000)]),
      jsonResponse([binanceRate(100 * 60 * 60 * 1000), binanceRate(8000 * 60 * 60 * 1000)]),
    );

    const stats = {
      fetched: 4,
      stored: 4,
      inserted: 4,
      duplicatesSkipped: 0,
      oldest: new Date(100 * 60 * 60 * 1000),
      newest: new Date(16000 * 60 * 60 * 1000),
    };
    storeFundingRatesMock.mockResolvedValue(stats);
    const onProgress = vi.fn();

    const result = await fetchBinanceFundingHistory('ETHUSDT', 500, onProgress);

    expect(result).toEqual(stats);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const page1 = parseFundingUrl(fetchMock.mock.calls[0]![0] as string);
    const page2 = parseFundingUrl(fetchMock.mock.calls[1]![0] as string);
    expect(page1.symbol).toBe('ETHUSDT');
    expect(page2.symbol).toBe('ETHUSDT');
    // Pages are contiguous: second picks up where the first ended.
    expect(page2.startTime).toBe(page1.endTime);
    // First page spans one full window from its start.
    expect(page1.endTime - page1.startTime).toBe(PAGE_WINDOW_MS);
    // Second page ends at "now".
    const now = Date.now();
    expect(page2.endTime).toBeLessThanOrEqual(now + 1000);
    expect(page2.endTime).toBeGreaterThan(now - 1000);

    // Progress reports the cumulative count after each page
    expect(onProgress).toHaveBeenNthCalledWith(1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 4);

    // Rows from both pages arrive combined and sorted ascending
    const rows = storeFundingRatesMock.mock.calls[0]![0] as FundingRateRow[];
    const times = rows.map((r) => r.fundingTime.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(rows[0].symbol).toBe('ETHUSDT');
  });

  it('continues pagination when an early page is empty', async () => {
    pageResponses.push(
      jsonResponse([]),
      jsonResponse([binanceRate(10 * 60 * 60 * 1000)]),
    );

    const stats = {
      fetched: 1,
      stored: 1,
      inserted: 1,
      duplicatesSkipped: 0,
      oldest: new Date(10 * 60 * 60 * 1000),
      newest: new Date(10 * 60 * 60 * 1000),
    };
    storeFundingRatesMock.mockResolvedValue(stats);
    const onProgress = vi.fn();

    const result = await fetchBinanceFundingHistory('BTCUSDT', 500, onProgress);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(stats);
    // Empty page logs debug and does not report progress
    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(1);
    const rows = storeFundingRatesMock.mock.calls[0]![0] as FundingRateRow[];
    expect(rows).toHaveLength(1);
  });

  it('returns zero stats without calling the store when all pages are empty', async () => {
    // No pageResponses queued → fallback returns an empty page
    const result = await fetchBinanceFundingHistory('BTCUSDT', 30);

    expect(result).toEqual(ZERO_STATS);
    expect(storeFundingRatesMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('[BinanceFundingFeed] No funding rates returned for BTCUSDT');
  });

  it('skips the fetch loop entirely for a zero-day window', async () => {
    const result = await fetchBinanceFundingHistory('BTCUSDT', 0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeFundingRatesMock).not.toHaveBeenCalled();
    expect(result).toEqual(ZERO_STATS);
  });

  it('rejects and skips the store on a non-ok API response', async () => {
    pageResponses.push(jsonResponse({ code: -1121, msg: 'Invalid symbol.' }, 400));

    await expect(fetchBinanceFundingHistory('BADUSDT', 30)).rejects.toThrow(
      'Binance Futures API error: 400 Error for',
    );

    expect(storeFundingRatesMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[BinanceFundingFeed] Page fetch failed',
      expect.objectContaining({ symbol: 'BADUSDT' }),
    );
  });

  it('rejects and skips the store on a network failure', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('fetch failed')));

    await expect(fetchBinanceFundingHistory('BTCUSDT', 30)).rejects.toThrow('fetch failed');

    expect(storeFundingRatesMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[BinanceFundingFeed] Page fetch failed',
      expect.objectContaining({
        symbol: 'BTCUSDT',
        error: 'fetch failed',
      }),
    );
  });

  it('logs the fetch intent and completion summary', async () => {
    pageResponses.push(jsonResponse([binanceRate(1000)]));
    storeFundingRatesMock.mockResolvedValue({
      fetched: 1,
      stored: 1,
      inserted: 1,
      duplicatesSkipped: 0,
      oldest: new Date(1000),
      newest: new Date(1000),
    });

    await fetchBinanceFundingHistory('BTCUSDT', 30);

    expect(logger.info).toHaveBeenCalledWith('[BinanceFundingFeed] Fetching 30d history for BTCUSDT');
    expect(logger.info).toHaveBeenCalledWith(
      '[BinanceFundingFeed] Done: 1 rates stored for BTCUSDT (fetched 1)',
    );
    expect(logger.debug).toHaveBeenCalled();
  });
});
