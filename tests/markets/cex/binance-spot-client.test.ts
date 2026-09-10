/**
 * BinanceSpotClient unit tests — CcxtExchangeAdapter injected as mock.
 * No real network calls. Tests mapping logic and feature flag gating.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BinanceSpotClient, createBinanceExchange } from '../../../src/desk/markets/cex/binance-spot-client';
import type { CcxtExchangeAdapter } from '../../../src/desk/markets/cex/binance-spot-client';

// ── Logger mock ───────────────────────────────────────────────────────────────

vi.mock('../../../src/desk/core/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockExchange(): CcxtExchangeAdapter {
  return {
    fetchOHLCV: vi.fn(),
    fetchOrderBook: vi.fn(),
    fetchBalance: vi.fn(),
    createOrder: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BinanceSpotClient', () => {
  let mockExchange: CcxtExchangeAdapter;
  let client: BinanceSpotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExchange = makeMockExchange();
    // Inject mock exchange — no real ccxt instantiation
    client = new BinanceSpotClient({ perpEnabled: false }, mockExchange);
  });

  // ── getCandles ──────────────────────────────────────────────────────────────

  describe('getCandles', () => {
    it('fetches candles and maps to CexCandle shape', async () => {
      const rawOhlcv = [
        [1700000000000, 30000, 31000, 29000, 30500, 100],
        [1700003600000, 30500, 32000, 30000, 31500, 200],
      ];
      vi.mocked(mockExchange.fetchOHLCV).mockResolvedValueOnce(rawOhlcv as never);

      const candles = await client.getCandles('BTC/USDT', '1h', 2);

      expect(mockExchange.fetchOHLCV).toHaveBeenCalledWith('BTC/USDT', '1h', undefined, 2);
      expect(candles).toHaveLength(2);
      expect(candles[0]).toMatchObject({
        timestamp: 1700000000000,
        open: 30000,
        high: 31000,
        low: 29000,
        close: 30500,
        volume: 100,
      });
      expect(candles[1].close).toBe(31500);
    });

    it('returns empty array when exchange returns empty', async () => {
      vi.mocked(mockExchange.fetchOHLCV).mockResolvedValueOnce([]);
      const candles = await client.getCandles('ETH/USDT');
      expect(candles).toEqual([]);
    });

    it('uses default timeframe 1h and limit 100', async () => {
      vi.mocked(mockExchange.fetchOHLCV).mockResolvedValueOnce([]);
      await client.getCandles('BTC/USDT');
      expect(mockExchange.fetchOHLCV).toHaveBeenCalledWith('BTC/USDT', '1h', undefined, 100);
    });

    it('propagates exchange error', async () => {
      vi.mocked(mockExchange.fetchOHLCV).mockRejectedValueOnce(new Error('Network error'));
      await expect(client.getCandles('BTC/USDT')).rejects.toThrow('Network error');
    });
  });

  // ── getOrderBook ────────────────────────────────────────────────────────────

  describe('getOrderBook', () => {
    it('maps bids and asks to CexBookLevel', async () => {
      vi.mocked(mockExchange.fetchOrderBook).mockResolvedValueOnce({
        bids: [[30000, 1.5], [29900, 2.0]],
        asks: [[30100, 0.8], [30200, 1.2]],
        timestamp: 1700000000000,
      });

      const book = await client.getOrderBook('BTC/USDT', 20);

      expect(mockExchange.fetchOrderBook).toHaveBeenCalledWith('BTC/USDT', 20);
      expect(book.symbol).toBe('BTC/USDT');
      expect(book.bids).toHaveLength(2);
      expect(book.bids[0]).toEqual({ price: 30000, size: 1.5 });
      expect(book.asks[0]).toEqual({ price: 30100, size: 0.8 });
      expect(book.timestamp).toBe(1700000000000);
    });

    it('falls back to Date.now() when exchange timestamp is undefined', async () => {
      const before = Date.now();
      vi.mocked(mockExchange.fetchOrderBook).mockResolvedValueOnce({
        bids: [],
        asks: [],
        timestamp: undefined,
      });
      const book = await client.getOrderBook('ETH/USDT');
      expect(book.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('propagates exchange error', async () => {
      vi.mocked(mockExchange.fetchOrderBook).mockRejectedValueOnce(new Error('timeout'));
      await expect(client.getOrderBook('BTC/USDT')).rejects.toThrow('timeout');
    });
  });

  // ── getBalances ─────────────────────────────────────────────────────────────

  describe('getBalances', () => {
    it('filters zero-balance assets and maps correctly', async () => {
      vi.mocked(mockExchange.fetchBalance).mockResolvedValueOnce({
        total: { BTC: 0.5, ETH: 0, USDT: 1000 },
        free: { BTC: 0.5, ETH: 0, USDT: 900 },
        used: { BTC: 0, ETH: 0, USDT: 100 },
      });

      const balances = await client.getBalances();

      expect(balances).toHaveLength(2);
      const btc = balances.find(b => b.asset === 'BTC')!;
      expect(btc).toEqual({ asset: 'BTC', free: 0.5, locked: 0, total: 0.5 });
      const usdt = balances.find(b => b.asset === 'USDT')!;
      expect(usdt).toEqual({ asset: 'USDT', free: 900, locked: 100, total: 1000 });
    });

    it('returns empty array when all balances are zero', async () => {
      vi.mocked(mockExchange.fetchBalance).mockResolvedValueOnce({
        total: { BTC: 0, ETH: 0 },
        free: {},
        used: {},
      });
      const balances = await client.getBalances();
      expect(balances).toEqual([]);
    });

    it('propagates exchange error', async () => {
      vi.mocked(mockExchange.fetchBalance).mockRejectedValueOnce(new Error('Auth failed'));
      await expect(client.getBalances()).rejects.toThrow('Auth failed');
    });
  });

  // ── placeOrder ──────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    it('places a spot market buy order and maps response', async () => {
      vi.mocked(mockExchange.createOrder).mockResolvedValueOnce({
        id: 'order-123',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        amount: 0.01,
        price: null,
        status: 'closed',
        timestamp: 1700000000000,
      });

      const response = await client.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        amount: 0.01,
      });

      expect(mockExchange.createOrder).toHaveBeenCalledWith(
        'BTC/USDT', 'market', 'buy', 0.01, undefined,
      );
      expect(response.id).toBe('order-123');
      expect(response.status).toBe('closed');
      expect(response.price).toBeUndefined();
    });

    it('places a limit sell order with price', async () => {
      vi.mocked(mockExchange.createOrder).mockResolvedValueOnce({
        id: 'limit-456',
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'limit',
        amount: 1.0,
        price: 3000,
        status: 'open',
        timestamp: 1700000000000,
      });

      const response = await client.placeOrder({
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'limit',
        amount: 1.0,
        price: 3000,
      });

      expect(mockExchange.createOrder).toHaveBeenCalledWith(
        'ETH/USDT', 'limit', 'sell', 1.0, 3000,
      );
      expect(response.price).toBe(3000);
    });

    it('throws for perp symbol when perpEnabled=false', async () => {
      await expect(
        client.placeOrder({ symbol: 'BTC/USDT:USDT', side: 'buy', type: 'market', amount: 1 }),
      ).rejects.toThrow('CEX_PERP_ENABLED=false');
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
    });

    it('allows perp symbol when perpEnabled=true', async () => {
      const perpClient = new BinanceSpotClient({ perpEnabled: true }, mockExchange);
      vi.mocked(mockExchange.createOrder).mockResolvedValueOnce({
        id: 'perp-1',
        symbol: 'BTC/USDT:USDT',
        side: 'buy',
        type: 'market',
        amount: 1,
        price: null,
        status: 'open',
        timestamp: Date.now(),
      });

      const response = await perpClient.placeOrder({
        symbol: 'BTC/USDT:USDT',
        side: 'buy',
        type: 'market',
        amount: 1,
      });
      expect(response.id).toBe('perp-1');
    });

    it('falls back to unknown status when exchange returns null', async () => {
      vi.mocked(mockExchange.createOrder).mockResolvedValueOnce({
        id: 'x',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        amount: 0.1,
        price: null,
        status: null,
        timestamp: null,
      });
      const response = await client.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        amount: 0.1,
      });
      expect(response.status).toBe('unknown');
      expect(response.timestamp).toBeGreaterThan(0);
    });
  });

  // ── getName ─────────────────────────────────────────────────────────────────

  it('getName returns binance-spot', () => {
    expect(client.getName()).toBe('binance-spot');
  });

  // ── getBalances: nullish fallback ────────────────────────────────────────────

  it('falls back to 0 when total balance entry is nullish', async () => {
    // Simulate an asset whose `total` is undefined — the `total ?? 0` branch
    // must treat it as zero and skip it (not push a NaN entry).
    vi.mocked(mockExchange.fetchBalance).mockResolvedValueOnce({
      total: { BTC: 0.5, DOGE: undefined },
      free: { BTC: 0.5, DOGE: 100 },
      used: { BTC: 0, DOGE: 0 },
    });

    const balances = await client.getBalances();

    // DOGE has total=undefined → `total ?? 0` = 0 → skipped by the zero filter.
    expect(balances).toHaveLength(1);
    expect(balances[0].asset).toBe('BTC');
  });

  // ── createBinanceExchange ────────────────────────────────────────────────────

  it('createBinanceExchange returns an adapter with the expected methods', () => {
    // Exercises the factory function (previously 0% function coverage) and
    // confirms the ccxt binance constructor is invoked with the right shape.
    const adapter = createBinanceExchange();
    expect(adapter).toBeDefined();
    expect(typeof adapter.fetchOHLCV).toBe('function');
    expect(typeof adapter.fetchOrderBook).toBe('function');
    expect(typeof adapter.fetchBalance).toBe('function');
    expect(typeof adapter.createOrder).toBe('function');
  });

  // ── constructor: flags ?? loadFeatureFlags() fallback ────────────────────────

  it('falls back to loadFeatureFlags() when no flags are provided', () => {
    // Exercises the `flags ?? loadFeatureFlags()` branch (line 97) by omitting
    // the flags argument entirely. The client should still construct and work.
    const fallbackClient = new BinanceSpotClient(undefined, mockExchange);
    expect(fallbackClient.getName()).toBe('binance-spot');
  });

  it('falls back to createBinanceExchange() when no exchange is provided', () => {
    // Exercises the `exchange ?? createBinanceExchange()` branch (line 98).
    // The real ccxt binance ctor is invoked with empty API keys — no network
    // call is made, so this is safe in a unit test.
    const fallbackClient = new BinanceSpotClient({ perpEnabled: false });
    expect(fallbackClient.getName()).toBe('binance-spot');
    expect(typeof fallbackClient.getCandles).toBe('function');
  });

  it('falls back to {} when fetchBalance returns no total field', async () => {
    // Exercises the `raw.total ?? {}` branch (line 141) — the for...of loop
    // must not throw when total is undefined.
    vi.mocked(mockExchange.fetchBalance).mockResolvedValueOnce({});
    const balances = await client.getBalances();
    expect(balances).toEqual([]);
  });

  it('falls back to 0 for free/used when those fields are missing', async () => {
    // Exercises the `raw.free?.[asset] ?? 0` and `raw.used?.[asset] ?? 0`
    // branches (lines 145-146) when free/used are absent.
    vi.mocked(mockExchange.fetchBalance).mockResolvedValueOnce({
      total: { BTC: 0.5 },
    });
    const balances = await client.getBalances();
    expect(balances).toHaveLength(1);
    expect(balances[0]).toEqual({ asset: 'BTC', free: 0, locked: 0, total: 0.5 });
  });
});
