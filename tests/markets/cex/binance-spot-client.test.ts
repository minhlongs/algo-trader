/**
 * BinanceSpotClient unit tests — HTTP mocked via vi.stubGlobal fetch.
 * No real network calls. ccxt internals are exercised through the class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BinanceSpotClient } from '../../../src/markets/cex/binance-spot-client.js';

// ── Logger mock ───────────────────────────────────────────────────────────────
vi.mock('../../../src/core/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── ccxt mock — avoids real HTTP/auth, tests our mapping logic ────────────────
vi.mock('ccxt', () => {
  const MockBinance = vi.fn().mockImplementation(() => ({
    fetchOHLCV: vi.fn(),
    fetchOrderBook: vi.fn(),
    fetchBalance: vi.fn(),
    createOrder: vi.fn(),
  }));
  return { default: { binance: MockBinance } };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCcxtOHLCV(ts = 1700000000000): ccxt.OHLCV {
  return [ts, 30000, 31000, 29000, 30500, 100] as ccxt.OHLCV;
}

// Need ccxt type for OHLCV
// eslint-disable-next-line @typescript-eslint/no-require-imports
import type ccxt from 'ccxt';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BinanceSpotClient', () => {
  let client: BinanceSpotClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExchange: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = new BinanceSpotClient({ perpEnabled: false });
    // Access the mocked exchange instance
    const ccxtModule = await import('ccxt');
    const MockBinance = (ccxtModule.default as unknown as { binance: ReturnType<typeof vi.fn> }).binance;
    mockExchange = MockBinance.mock.results[MockBinance.mock.results.length - 1].value;
  });

  // ── getCandles ──────────────────────────────────────────────────────────────

  describe('getCandles', () => {
    it('fetches candles and maps to CexCandle shape', async () => {
      const rawOhlcv: ccxt.OHLCV[] = [
        makeCcxtOHLCV(1700000000000),
        makeCcxtOHLCV(1700003600000),
      ];
      mockExchange.fetchOHLCV.mockResolvedValueOnce(rawOhlcv);

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
    });

    it('returns empty array when exchange returns empty', async () => {
      mockExchange.fetchOHLCV.mockResolvedValueOnce([]);
      const candles = await client.getCandles('ETH/USDT');
      expect(candles).toEqual([]);
    });

    it('propagates exchange error', async () => {
      mockExchange.fetchOHLCV.mockRejectedValueOnce(new Error('Network error'));
      await expect(client.getCandles('BTC/USDT')).rejects.toThrow('Network error');
    });
  });

  // ── getOrderBook ────────────────────────────────────────────────────────────

  describe('getOrderBook', () => {
    it('maps order book bids and asks correctly', async () => {
      mockExchange.fetchOrderBook.mockResolvedValueOnce({
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

    it('falls back to Date.now() when exchange timestamp is null', async () => {
      const before = Date.now();
      mockExchange.fetchOrderBook.mockResolvedValueOnce({
        bids: [],
        asks: [],
        timestamp: null,
      });
      const book = await client.getOrderBook('ETH/USDT');
      expect(book.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  // ── getBalances ─────────────────────────────────────────────────────────────

  describe('getBalances', () => {
    it('filters zero-balance assets and maps correctly', async () => {
      mockExchange.fetchBalance.mockResolvedValueOnce({
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
      mockExchange.fetchBalance.mockResolvedValueOnce({
        total: { BTC: 0, ETH: 0 },
        free: {},
        used: {},
      });
      const balances = await client.getBalances();
      expect(balances).toEqual([]);
    });
  });

  // ── placeOrder ──────────────────────────────────────────────────────────────

  describe('placeOrder', () => {
    it('places a spot market buy order successfully', async () => {
      mockExchange.createOrder.mockResolvedValueOnce({
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

      expect(mockExchange.createOrder).toHaveBeenCalledWith('BTC/USDT', 'market', 'buy', 0.01, undefined);
      expect(response.id).toBe('order-123');
      expect(response.status).toBe('closed');
    });

    it('throws for perp symbol when CEX_PERP_ENABLED=false', async () => {
      const perpClient = new BinanceSpotClient({ perpEnabled: false });
      await expect(
        perpClient.placeOrder({ symbol: 'BTC/USDT:USDT', side: 'buy', type: 'market', amount: 1 }),
      ).rejects.toThrow('CEX_PERP_ENABLED=false');
    });

    it('allows perp symbol when CEX_PERP_ENABLED=true', async () => {
      const perpClient = new BinanceSpotClient({ perpEnabled: true });
      const ccxtModule = await import('ccxt');
      const MockBinance = (ccxtModule.default as unknown as { binance: ReturnType<typeof vi.fn> }).binance;
      const perpExchange = MockBinance.mock.results[MockBinance.mock.results.length - 1].value;

      perpExchange.createOrder.mockResolvedValueOnce({
        id: 'perp-order-1',
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
      expect(response.id).toBe('perp-order-1');
    });
  });

  // ── getName ─────────────────────────────────────────────────────────────────

  it('getName returns binance-spot', () => {
    expect(client.getName()).toBe('binance-spot');
  });
});
