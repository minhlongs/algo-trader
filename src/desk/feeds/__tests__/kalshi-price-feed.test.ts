import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchKalshiMarkets, fetchKalshiMarket, __resetCacheForTests } from '../kalshi-price-feed';
import { okResponse, errorResponse, RAW_MARKET } from './kalshi-price-feed.fixtures';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchKalshiMarkets', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetCacheForTests();
  });

  it('cache miss triggers fetch and returns normalized markets', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    const result = await fetchKalshiMarkets();
    expect(result.markets).toHaveLength(1);
    expect(result.markets[0].ticker).toBe('TEST-2026');
    expect(result.markets[0].yesPrice).toBeCloseTo(0.5);
    expect(result.markets[0].noPrice).toBeCloseTo(0.45);
    expect(result.fetchedAt).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/markets?limit=100'),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });

  it('cache hit returns cached data without fetch', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    await fetchKalshiMarkets();
    fetchMock.mockReset();
    const result = await fetchKalshiMarkets();
    expect(result.markets).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('uses custom limit parameter', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [] }));
    await fetchKalshiMarkets(50);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/markets?limit=50'), expect.any(Object));
  });

  it('returns empty array when API returns no markets key', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    expect((await fetchKalshiMarkets()).markets).toEqual([]);
  });

  it('returns empty array when API returns empty markets array', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [] }));
    expect((await fetchKalshiMarkets()).markets).toEqual([]);
  });

  it('throws on HTTP 500 error', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, 'Server Error'));
    await expect(fetchKalshiMarkets()).rejects.toThrow('[KalshiFeed] HTTP 500');
  });

  it('throws on HTTP 404 error', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404));
    await expect(fetchKalshiMarkets()).rejects.toThrow('[KalshiFeed] HTTP 404');
  });

  it('throws on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network down'));
    await expect(fetchKalshiMarkets()).rejects.toThrow('Network down');
  });

  it('normalizes multiple markets', async () => {
    const rawMarkets = [RAW_MARKET, { ...RAW_MARKET, ticker: 'TEST-2027', yes_bid: 60, yes_ask: 70 }];
    fetchMock.mockResolvedValueOnce(okResponse({ markets: rawMarkets }));
    const result = await fetchKalshiMarkets();
    expect(result.markets).toHaveLength(2);
    expect(result.markets[1].ticker).toBe('TEST-2027');
    expect(result.markets[1].yesPrice).toBeCloseTo(0.65);
  });
});

describe('fetchKalshiMarket', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    __resetCacheForTests();
  });

  it('cache hit returns cached market without fetch', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));
    await fetchKalshiMarkets();
    fetchMock.mockReset();
    const result = await fetchKalshiMarket('TEST-2026');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('TEST-2026');
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('cache miss fetches single market by ticker', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ market: RAW_MARKET }));
    const result = await fetchKalshiMarket('TEST-2026');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('TEST-2026');
    expect(result!.yesPrice).toBeCloseTo(0.5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/markets/TEST-2026'), expect.any(Object));
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404));
    expect(await fetchKalshiMarket('MISSING')).toBeNull();
  });

  it('returns null on fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await fetchKalshiMarket('TEST-2026')).toBeNull();
  });

  it('returns null when market field is missing in response', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));
    expect(await fetchKalshiMarket('TEST-2026')).toBeNull();
  });

  it('returns null on HTTP 500', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));
    expect(await fetchKalshiMarket('TEST-2026')).toBeNull();
  });
});
