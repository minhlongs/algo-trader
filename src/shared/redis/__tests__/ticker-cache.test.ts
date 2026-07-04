/**
 * TickerCache Tests
 *
 * Covers: constructor, setTicker, getTicker, getTickers,
 * getBestBidAcrossExchanges, clear with mocked Redis client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables — must be declared before vi.mock() calls
// ---------------------------------------------------------------------------

const mockPipeline = vi.hoisted(() => ({
  hset: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([] as unknown[]),
}));

const mockRedisClient = vi.hoisted(() => ({
  pipeline: vi.fn().mockReturnValue(mockPipeline),
  hgetall: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
}));

const { getRedisClient: mockGetRedisClient } = vi.hoisted(() => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}));

// ---------------------------------------------------------------------------
// Module mock
// ---------------------------------------------------------------------------

vi.mock('../index', () => ({
  getRedisClient: mockGetRedisClient,
  getPubClient: vi.fn(() => mockRedisClient),
  getSubClient: vi.fn(() => mockRedisClient),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { TickerCache, type Ticker } from '../ticker-cache';

describe('TickerCache', () => {
  let cache: TickerCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new TickerCache();
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------

  describe('constructor', () => {
    it('creates an instance and calls getRedisClient', () => {
      expect(cache).toBeInstanceOf(TickerCache);
      expect(mockGetRedisClient).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // setTicker
  // ---------------------------------------------------------------

  describe('setTicker', () => {
    const exchange = 'binance';
    const symbol = 'BTC/USDT';
    const ticker: Ticker = {
      last: 50000.5,
      bid: 49990.0,
      ask: 50010.0,
      high24h: 51000.0,
      low24h: 49000.0,
      volume24h: 12345.678,
      timestamp: 1700000000000,
    };

    beforeEach(() => {
      mockPipeline.exec.mockResolvedValue([]);
    });

    it('stores ticker data as string values via pipeline', async () => {
      await cache.setTicker(exchange, symbol, ticker);

      expect(mockRedisClient.pipeline).toHaveBeenCalledTimes(1);
      expect(mockPipeline.hset).toHaveBeenCalledWith('ticker:binance:BTC/USDT', {
        last: '50000.5',
        bid: '49990',
        ask: '50010',
        high24h: '51000',
        low24h: '49000',
        volume24h: '12345.678',
        timestamp: '1700000000000',
      });
      expect(mockPipeline.expire).toHaveBeenCalledWith('ticker:binance:BTC/USDT', 3600);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('converts zero values correctly', async () => {
      const zeroTicker: Ticker = {
        last: 0,
        bid: 0,
        ask: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        timestamp: 0,
      };

      await cache.setTicker(exchange, symbol, zeroTicker);

      expect(mockPipeline.hset).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          last: '0',
          timestamp: '0',
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // getTicker
  // ---------------------------------------------------------------

  describe('getTicker', () => {
    const exchange = 'binance';
    const symbol = 'BTC/USDT';

    it('returns parsed Ticker object when data exists', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce({
        last: '50000.5',
        bid: '49990',
        ask: '50010',
        high24h: '51000',
        low24h: '49000',
        volume24h: '12345.678',
        timestamp: '1700000000000',
      });

      const result = await cache.getTicker(exchange, symbol);

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith('ticker:binance:BTC/USDT');
      expect(result).toEqual({
        last: 50000.5,
        bid: 49990,
        ask: 50010,
        high24h: 51000,
        low24h: 49000,
        volume24h: 12345.678,
        timestamp: 1700000000000,
      });
    });

    it('returns null for empty hash', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce({});

      const result = await cache.getTicker(exchange, symbol);

      expect(result).toBeNull();
    });

    it('returns null when data is null', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce(null);

      const result = await cache.getTicker(exchange, symbol);

      expect(result).toBeNull();
    });

    it('handles missing fields with parseFloat fallback to 0', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce({
        last: '50000.5',
        bid: undefined as unknown as string,
        timestamp: 'invalid',
      });

      const result = await cache.getTicker(exchange, symbol);

      expect(result).toEqual({
        last: 50000.5,
        bid: 0,
        ask: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        timestamp: 0,
      });
    });
  });

  // ---------------------------------------------------------------
  // getTickers
  // ---------------------------------------------------------------

  describe('getTickers', () => {
    const exchange = 'binance';
    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];

    it('returns Map of tickers for found symbols', async () => {
      mockRedisClient.hgetall
        .mockResolvedValueOnce({
          last: '50000',
          bid: '49990',
          ask: '50010',
          high24h: '51000',
          low24h: '49000',
          volume24h: '10000',
          timestamp: '1700000000000',
        })
        .mockResolvedValueOnce({
          last: '3000',
          bid: '2990',
          ask: '3010',
          high24h: '3100',
          low24h: '2900',
          volume24h: '5000',
          timestamp: '1700000000001',
        })
        .mockResolvedValueOnce({});

      const result = await cache.getTickers(exchange, symbols);

      expect(result.size).toBe(2);
      expect(result.has('BTC/USDT')).toBe(true);
      expect(result.has('ETH/USDT')).toBe(true);
      expect(result.has('SOL/USDT')).toBe(false);
      expect(result.get('BTC/USDT')!.last).toBe(50000);
      expect(result.get('ETH/USDT')!.last).toBe(3000);
    });

    it('returns empty Map when no symbols have data', async () => {
      mockRedisClient.hgetall.mockResolvedValue({});

      const result = await cache.getTickers(exchange, symbols);

      expect(result.size).toBe(0);
    });

    it('returns empty Map for empty symbols array', async () => {
      const result = await cache.getTickers(exchange, []);

      expect(result.size).toBe(0);
      expect(mockRedisClient.hgetall).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // getBestBidAcrossExchanges
  // ---------------------------------------------------------------

  describe('getBestBidAcrossExchanges', () => {
    const symbols = ['BTC/USDT', 'ETH/USDT'];
    const exchanges = ['binance', 'kraken'];

    it('returns highest bid across exchanges per symbol', async () => {
      mockRedisClient.hgetall
        // BTC/USDT on binance
        .mockResolvedValueOnce({
          last: '50000',
          bid: '50000',
          ask: '50010',
          high24h: '51000',
          low24h: '49000',
          volume24h: '10000',
          timestamp: '1700000000000',
        })
        // BTC/USDT on kraken
        .mockResolvedValueOnce({
          last: '50050',
          bid: '50050',
          ask: '50060',
          high24h: '51000',
          low24h: '49000',
          volume24h: '8000',
          timestamp: '1700000000000',
        })
        // ETH/USDT on binance
        .mockResolvedValueOnce({
          last: '3000',
          bid: '3000',
          ask: '3010',
          high24h: '3100',
          low24h: '2900',
          volume24h: '5000',
          timestamp: '1700000000001',
        })
        // ETH/USDT on kraken
        .mockResolvedValueOnce({
          last: '2990',
          bid: '2990',
          ask: '3000',
          high24h: '3100',
          low24h: '2900',
          volume24h: '3000',
          timestamp: '1700000000001',
        });

      const result = await cache.getBestBidAcrossExchanges(symbols, exchanges);

      expect(result.size).toBe(2);
      // Kraken has higher bid for BTC/USDT
      expect(result.get('BTC/USDT')).toEqual({ exchange: 'kraken', bid: 50050 });
      // Binance has higher bid for ETH/USDT
      expect(result.get('ETH/USDT')).toEqual({ exchange: 'binance', bid: 3000 });
    });

    it('skips symbols where no exchange has data', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce({}).mockResolvedValueOnce({});

      const result = await cache.getBestBidAcrossExchanges(['UNK/PAIR'], exchanges);

      expect(result.size).toBe(0);
    });

    it('handles partially missing data on some exchanges', async () => {
      mockRedisClient.hgetall
        // ETH/USDT on binance — has data
        .mockResolvedValueOnce({
          last: '3000',
          bid: '3000',
          ask: '3010',
          high24h: '3100',
          low24h: '2900',
          volume24h: '5000',
          timestamp: '1700000000001',
        })
        // ETH/USDT on kraken — no data
        .mockResolvedValueOnce({});

      const result = await cache.getBestBidAcrossExchanges(
        ['ETH/USDT'],
        ['binance', 'kraken'],
      );

      expect(result.size).toBe(1);
      expect(result.get('ETH/USDT')).toEqual({ exchange: 'binance', bid: 3000 });
    });
  });

  // ---------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------

  describe('clear', () => {
    it('deletes the key for the given exchange and symbol', async () => {
      await cache.clear('binance', 'BTC/USDT');

      expect(mockRedisClient.del).toHaveBeenCalledWith('ticker:binance:BTC/USDT');
    });

    it('resolves successfully', async () => {
      await expect(cache.clear('coinbase', 'ETH/USDT')).resolves.toBeUndefined();
    });
  });
});
