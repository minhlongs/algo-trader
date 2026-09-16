import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchKalshiMarkets,
  getLatestKalshiPrices,
  startKalshiPolling,
  __resetCacheForTests,
} from '../kalshi-price-feed';
import { okResponse, RAW_MARKET } from './kalshi-price-feed.fixtures';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getLatestKalshiPrices', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetCacheForTests();
  });

  it('returns empty Map when no cache exists', () => {
    const result = getLatestKalshiPrices();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns copy of cache when valid', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    await fetchKalshiMarkets();
    const result = getLatestKalshiPrices();
    expect(result.size).toBe(1);
    expect(result.has('TEST-2026')).toBe(true);
    result.delete('TEST-2026');
    expect(getLatestKalshiPrices().size).toBe(1);
  });
});

describe('startKalshiPolling', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetCacheForTests();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial poll fetches markets', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    const { stop } = startKalshiPolling(60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stop() halts polling', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    const { stop } = startKalshiPolling(60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles fetch errors gracefully without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('API down'));
    const { stop } = startKalshiPolling(60_000);
    await vi.advanceTimersByTimeAsync(0);
    stop();
  });

  it('schedules next poll after interval', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }))
      .mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    const { stop } = startKalshiPolling(60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });
});
