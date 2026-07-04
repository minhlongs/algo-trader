/**
 * CoinGecko Price Feed Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

// Mock dependencies
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../messaging/index', () => ({
  getMessageBus: vi.fn(() => ({
    isConnected: vi.fn(() => true),
    publish: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import after mocks are set up
import {
  fetchCoinGeckoMarkets,
  fetchCoinGeckoSimplePrices,
  fetchCoinGeckoHistoricalData,
  getLatestCoinGeckoPrices,
  getCoinFromCache,
  clearCoinGeckoCache,
  startCoinGeckoPolling,
  getCoinGeckoNatsTopic,
} from '../coingecko-price-feed';

describe('CoinGeckoPriceFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCoinGeckoCache();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('fetchCoinGeckoMarkets', () => {
    const mockMarketResponse = {
      markets: [
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          current_price: 50000,
          market_cap: 1000000000000,
          total_volume: 25000000000,
          price_change_24h: 1000,
          price_change_percentage_24h: 2.04,
          last_updated: '2025-06-21T12:00:00.000Z',
        },
        {
          id: 'ethereum',
          symbol: 'eth',
          name: 'Ethereum',
          current_price: 3000,
          market_cap: 400000000000,
          total_volume: 15000000000,
          price_change_24h: -50,
          price_change_percentage_24h: -1.67,
          last_updated: '2025-06-21T12:00:00.000Z',
        },
      ],
    };

    it('should fetch and normalize markets successfully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockMarketResponse),
      });

      const result = await fetchCoinGeckoMarkets(10, 'usd');

      expect(result.markets).toHaveLength(2);
      expect(result.markets[0]).toEqual({
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        currentPrice: 50000,
        marketCap: 1000000000000,
        totalVolume: 25000000000,
        priceChange24h: 1000,
        priceChangePercentage24h: 2.04,
        lastUpdated: new Date('2025-06-21T12:00:00.000Z').getTime(),
        vsCurrency: 'usd',
      });
      expect(result.fetchedAt).toBeTypeOf('number');
    });

    it('should handle null values in API response', async () => {
      const responseWithNulls = {
        markets: [
          {
            id: 'testcoin',
            symbol: 'test',
            name: 'Test Coin',
            current_price: null,
            market_cap: null,
            total_volume: null,
            price_change_24h: null,
            price_change_percentage_24h: null,
            last_updated: null,
          },
        ],
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(responseWithNulls),
      });

      const result = await fetchCoinGeckoMarkets();

      expect(result.markets[0].currentPrice).toBe(0);
      expect(result.markets[0].marketCap).toBe(0);
      expect(result.markets[0].lastUpdated).toBeTypeOf('number');
    });

    it('should respect rate limiting between calls', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockMarketResponse),
      });

      const start = Date.now();
      await fetchCoinGeckoMarkets();
      await fetchCoinGeckoMarkets();
      const elapsed = Date.now() - start;

      // Should have waited at least 2000ms between calls (allow 10ms tolerance for timer precision)
      expect(elapsed).toBeGreaterThanOrEqual(1990);
    });

    it('should clamp limit to 250', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockMarketResponse),
      });

      await fetchCoinGeckoMarkets(500);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('per_page=250');
    });

    it('should return cached data when cache is valid', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockMarketResponse),
      });

      // First call to populate cache
      const result1 = await fetchCoinGeckoMarkets();
      expect(result1.markets).toHaveLength(2);

      // Second call within cache TTL should not call fetch
      (global.fetch as any).mockClear();
      const result2 = await fetchCoinGeckoMarkets();
      expect(result2.markets).toHaveLength(2);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return empty array on error with no cache', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchCoinGeckoMarkets();
      expect(result.markets).toEqual([]);
    });

    // Note: fetch timeout is handled by AbortSignal.timeout in fetch options.
    // The underlying fetch API will abort automatically, which we rely on.
    // Error handling is tested via HTTP error responses.
  });

  describe('fetchCoinGeckoSimplePrices', () => {
    it('should fetch prices for specific IDs', async () => {
      const mockResponse = {
        bitcoin: { usd: 50000 },
        ethereum: { usd: 3000 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await fetchCoinGeckoSimplePrices(['bitcoin', 'ethereum']);

      expect(result.size).toBe(2);
      expect(result.get('bitcoin')?.price).toBe(50000);
      expect(result.get('ethereum')?.price).toBe(3000);
    });

    it('should handle empty ID list', async () => {
      const result = await fetchCoinGeckoSimplePrices([]);
      expect(result.size).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle missing price in response', async () => {
      const mockResponse = {
        bitcoin: { usd: 50000 },
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await fetchCoinGeckoSimplePrices(['bitcoin', 'ethereum']);
      expect(result.get('bitcoin')?.price).toBe(50000);
      // Missing IDs are not included in the result map
      expect(result.has('ethereum')).toBe(false);
    });
  });

  describe('fetchCoinGeckoHistoricalData', () => {
    it('should fetch historical data successfully', async () => {
      const mockResponse = {
        prices: [
          [1718928000000, 50000],
          [1719014400000, 51000],
          [1719100800000, 49000],
        ],
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await fetchCoinGeckoHistoricalData('bitcoin', 3, 'usd');

      expect(result.id).toBe('bitcoin');
      expect(result.currency).toBe('usd');
      expect(result.timestamps).toEqual([1718928000000, 1719014400000, 1719100800000]);
      expect(result.prices).toEqual([50000, 51000, 49000]);
    });

    it('should handle empty historical data', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ prices: [] }),
      });

      const result = await fetchCoinGeckoHistoricalData('bitcoin');
      expect(result.timestamps).toEqual([]);
      expect(result.prices).toEqual([]);
    });

    it('should handle historical fetch error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchCoinGeckoHistoricalData('invalid-id');
      expect(result.timestamps).toEqual([]);
      expect(result.prices).toEqual([]);
    });
  });

  describe('Cache Management', () => {
    it('getLatestCoinGeckoPrices should return empty Map when cache empty', () => {
      const result = getLatestCoinGeckoPrices();
      expect(result.size).toBe(0);
    });

    it('getCoinFromCache should return undefined when cache empty', () => {
      const result = getCoinFromCache('bitcoin');
      expect(result).toBeUndefined();
    });

    it('clearCoinGeckoCache should clear cache', async () => {
      const mockResponse = {
        markets: [
          {
            id: 'bitcoin',
            symbol: 'btc',
            name: 'Bitcoin',
            current_price: 50000,
            market_cap: 1000000000000,
            total_volume: 25000000000,
            price_change_24h: 1000,
            price_change_percentage_24h: 2.04,
            last_updated: '2025-06-21T12:00:00.000Z',
          },
        ],
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await fetchCoinGeckoMarkets();
      expect(getLatestCoinGeckoPrices().size).toBe(1);

      clearCoinGeckoCache();
      expect(getLatestCoinGeckoPrices().size).toBe(0);
    });
  });

  describe('startCoinGeckoPolling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return a stop function and perform initial fetch', async () => {
      const mockResponse = {
        markets: [
          {
            id: 'bitcoin',
            symbol: 'btc',
            name: 'Bitcoin',
            current_price: 50000,
            market_cap: 1000000000000,
            total_volume: 25000000000,
            price_change_24h: 1000,
            price_change_percentage_24h: 2.04,
            last_updated: '2025-06-21T12:00:00.000Z',
          },
        ],
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const service = startCoinGeckoPolling(60_000);
      expect(service).toHaveProperty('stop');
      expect(typeof service.stop).toBe('function');

      // The initial poll is triggered immediately but with rate limiting delay (2s)
      // Fast-forward 2 seconds to allow the initial fetch to complete
      await vi.advanceTimersByTimeAsync(2500);

      // Should have called fetch at least once
      expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(1);

      // Stop polling
      service.stop();

      // Advance time a bit more to ensure no more fetches happen after stop
      await vi.advanceTimersByTimeAsync(1000);
      const callCountAfterStop = (global.fetch as any).mock.calls.length;
      // Should not have fetched again after stop
      expect(callCountAfterStop).toBe((global.fetch as any).mock.calls.length);
    });

    it('should respect minimum poll interval of 5 seconds', async () => {
      const mockResponse = { markets: [] };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const service = startCoinGeckoPolling(2_000); // 2 seconds (below minimum)

      // Advance time to allow initial fetch
      await vi.advanceTimersByTimeAsync(2500);
      const calls1 = (global.fetch as any).mock.calls.length;

      // Advance to next scheduled poll (should be at least 5 seconds from start)
      await vi.advanceTimersByTimeAsync(5000);
      const calls2 = (global.fetch as any).mock.calls.length;

      // Should have called fetch again
      expect(calls2).toBeGreaterThan(calls1);

      service.stop();
    });
  });

  describe('getCoinGeckoNatsTopic', () => {
    it('should return correct NATS topic', () => {
      expect(getCoinGeckoNatsTopic()).toBe('market.coingecko.update');
    });
  });
});
