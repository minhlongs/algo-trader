/**
 * BinanceSpotClient unit tests — ccxt mocked via vi.mock.
 * No real network calls. Tests our mapping and flag logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BinanceSpotClient } from '../../../src/markets/cex/binance-spot-client.js';

// ── Logger mock ───────────────────────────────────────────────────────────────

vi.mock('../../../src/core/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── ccxt mock — prevent real HTTP; test our adapter mapping ──────────────────

const mockExchangeInstance = {
  fetchOHLCV: vi.fn(),
  fetchOrderBook: vi.fn(),
  fetchBalance: vi.fn(),
  createOrder: vi.fn(),
};

vi.mock('ccxt', () => {
  const binance = vi.fn(() => mockExchangeInstance);
  return { binance };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BinanceSpotClient', () => {
  let client: BinanceSpotClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new BinanceSpotClient({ perpEnabled: false });
  });

  // ── getCandles ──────────────────────────────────────────────────────────────

  describe('getCandles', () => {
    it('fetches candles and maps to CexCandle shape', async () => {
      const rawOhlcv = [
        [1700000000000, 30000, 31000, 29000, 30500, 100],
        [1700003600000, 30500, 32000, 30000, 31500, 200],
      ];
      mockExchangeInstance.fetchOHLCV.mockResolvedValueOnce(rawOhlcv);

      const candles = await client.getCandles('BTC/USDT', '1h', 2);

      expect(mockExchangeInstance.fetchOHLCV).toHaveBeenCalledWith('BTC/USDT', '1h', undefined, 2);
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
      mockExchangeInstance.fetchOHLCV.mockResolvedValueOnce([]);
      const candles = await client.getCandles('ETH/USDT');
      expect(candles).toEqual([]);
    });

    it('uses default timeframe 1h and limit 100', async () => {
      mockExchangeInstance.fetchOHLCV.mockResolvedValueOnce([]);
      await client.getCandles('BTC/USDT');
      expect(mockExchangeInstance.fetchOHLCV).toHaveBeenCalledWith('BTC/USDT', '1h', undefined, 100);
    });

    it('propagates exchange error', async () => {
      mockExchangeInstance.fetchOHLCV.mockRejectedValueOnce(new Error('Network error'));
      await expect(client.getCandles('BTC/USDT')).rejects.toThrow('Network error');
    });
  });

  // ── getOrderBook ────────────────────────────────────────────────────────────

  describe('getOrderBook', () => {
    it('maps bids and asks to CexBookLevel', async () => {
      mockExchangeInstance.fetchOrderBook.mockResolvedValueOnce({
        bids: [[30000, 1.5], [29900, 2.0]],
        asks: [[30100, 0.8], [30200, 1.2]],
        timestamp: 1700000000000,
      });

      const book = await client.getOrderBook('BTC/USDT', 20);

      expect(mockExchangeInstance.fetchOrderBook).toHaveBeenCalledWith('BTC/USDT', 20);
      expect(book.symbol).toBe('BTC/USDT');
      expect(book.bids).toHaveLength(2);
      expect(book.bids[0]).toEqual({ price: 30000, size: 1.5 });
      expect(book.asks[0]).toEqual({ price: 30100, size: 0.8 });
      expect(book.timestamp).toBe(1700000000000);
    });

    it('falls back to Date.now() when exchange timestamp is undefined', async () => {
      const before = Date.now();
      mockExchangeInstance.fetchOrderBook.mockResolvedValueOnce({
        bids: [],
        asks: [],
        timestamp: undefined,
      });
      const book = await client.getOrderBook('ETH/USDT');
      expect(book.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('propagates exchange error', async () => {
      mockExchangeInstance.fetchOrderBook.mockRejectedValueOnce(new Error('timeout'));
      await expect(client.getOrderBook('BTC/USDT')).rejects.toThrow('timeout');
    });
  });

  // ── getBalances ─────────────────────────────────────────────────────────────

  describe('getBalances', () => {
    it('filters zero-balance assets and maps correctly', async () => {
      mockExchangeInstance.fetchBalance.mockResolvedValueOnce({
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
      mockExchangeInstance.fetchBalance.mockResolvedValueOnce({
        total: { BTC: 0, ETH: 0 },
        free: {},
        used: {},
      });
      const balances = await client.getBalances();
      expect(balances).toEqual([]);
    });

    it('propagates exchange error', async () => {
      mockExchangeInstance.fetchBalance.mockRejectedValueOnce(new Error('Auth failed'));
      await expect(client.getBalances()).rejects.toThrow('Auth failed');
    });
  });

  // ── placeOrder ──────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    it('places a spot market buy order and maps response', async () => {
      mockExchangeInstance.createOrder.mockResolvedValueOnce({
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

      expect(mockExchangeInstance.createOrder).toHaveBeenCalledWith(
        'BTC/USDT', 'market', 'buy', 0.01, undefined,
      );
      expect(response.id).toBe('order-123');
      expect(response.status).toBe('closed');
      expect(response.price).toBeUndefined();
    });

    it('places a limit sell order with price', async () => {
      mockExchangeInstance.createOrder.mockResolvedValueOnce({
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

      expect(mockExchangeInstance.createOrder).toHaveBeenCalledWith(
        'ETH/USDT', 'limit', 'sell', 1.0, 3000,
      );
      expect(response.price).toBe(3000);
    });

    it('throws for perp symbol when CEX_PERP_ENABLED=false', async () => {
      await expect(
        client.placeOrder({ symbol: 'BTC/USDT:USDT', side: 'buy', type: 'market', amount: 1 }),
      ).rejects.toThrow('CEX_PERP_ENABLED=false');
      expect(mockExchangeInstance.createOrder).not.toHaveBeenCalled();
    });

    it('allows perp symbol when CEX_PERP_ENABLED=true', async () => {
      const perpClient = new BinanceSpotClient({ perpEnabled: true });
      mockExchangeInstance.createOrder.mockResolvedValueOnce({
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

    it('falls back to unknown status when exchange returns null status', async () => {
      mockExchangeInstance.createOrder.mockResolvedValueOnce({
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
});
