import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchKalshiMarkets,
  fetchKalshiMarket,
  getLatestKalshiPrices,
  startKalshiPolling,
  __resetCacheForTests,
} from '../kalshi-price-feed';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock('../../../shared/messaging/index', () => {
  const publishMock = vi.fn();
  return {
    getMessageBus: () => ({
      isConnected: () => true,
      publish: publishMock,
    }),
  };
});

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, body = ''): Response {
  return new Response(body || `Error ${status}`, {
    status,
    statusText: 'Error',
  });
}

const RAW_MARKET = {
  ticker: 'TEST-2026',
  title: 'Test Market',
  subtitle: 'A test',
  yes_bid: 45,
  yes_ask: 55,
  no_bid: 40,
  no_ask: 50,
  volume: 1000,
  open_interest: 500,
  status: 'open',
  category: 'politics',
};

// ---------------------------------------------------------------------------
// fetchKalshiMarkets
// ---------------------------------------------------------------------------

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
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
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

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/markets?limit=50'),
      expect.any(Object),
    );
  });

  it('returns empty array when API returns no markets key', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    const result = await fetchKalshiMarkets();

    expect(result.markets).toEqual([]);
  });

  it('returns empty array when API returns empty markets array', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ markets: [] }));

    const result = await fetchKalshiMarkets();

    expect(result.markets).toEqual([]);
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
    const rawMarkets = [
      RAW_MARKET,
      { ...RAW_MARKET, ticker: 'TEST-2027', yes_bid: 60, yes_ask: 70 },
    ];
    fetchMock.mockResolvedValueOnce(okResponse({ markets: rawMarkets }));

    const result = await fetchKalshiMarkets();

    expect(result.markets).toHaveLength(2);
    expect(result.markets[1].ticker).toBe('TEST-2027');
    expect(result.markets[1].yesPrice).toBeCloseTo(0.65);
  });
});

// ---------------------------------------------------------------------------
// fetchKalshiMarket
// ---------------------------------------------------------------------------

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
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/markets/TEST-2026'),
      expect.any(Object),
    );
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(404));

    const result = await fetchKalshiMarket('MISSING');

    expect(result).toBeNull();
  });

  it('returns null on fetch error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await fetchKalshiMarket('TEST-2026');

    expect(result).toBeNull();
  });

  it('returns null when market field is missing in response', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({}));

    const result = await fetchKalshiMarket('TEST-2026');

    expect(result).toBeNull();
  });

  it('returns null on HTTP 500', async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));

    const result = await fetchKalshiMarket('TEST-2026');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLatestKalshiPrices
// ---------------------------------------------------------------------------

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
    // Mutating returned map must not affect internal cache
    result.delete('TEST-2026');
    expect(getLatestKalshiPrices().size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// startKalshiPolling
// ---------------------------------------------------------------------------

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

    // Let the async poll() settle
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
    // Advance past the interval — no additional fetch should fire
    await vi.advanceTimersByTimeAsync(120_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles fetch errors gracefully without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('API down'));

    const { stop } = startKalshiPolling(60_000);

    // Initial poll should not throw (error is caught internally)
    await vi.advanceTimersByTimeAsync(0);

    stop();
  });

  it('schedules next poll after interval', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }))
      .mockResolvedValueOnce(okResponse({ markets: [RAW_MARKET] }));

    const { stop } = startKalshiPolling(60_000);

    // Initial poll
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Advance past interval — second poll fires
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    stop();
  });
});
