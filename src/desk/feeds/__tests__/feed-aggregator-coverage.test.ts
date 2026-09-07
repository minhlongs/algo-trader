/**
 * Feed Aggregator Coverage Tests
 * Target: 100% coverage for src/desk/feeds/feed-aggregator.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock Logger ────────────────────────────────────────────────────────────────

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

// ─── Mock Exchange Clients ──────────────────────────────────────────────────────

const { mockBinanceClient, mockOKXClient, mockBybitClient } = vi.hoisted(() => {
  const makeClient = () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
  });
  return {
    mockBinanceClient: makeClient(),
    mockOKXClient: makeClient(),
    mockBybitClient: makeClient(),
  };
});

vi.mock('../binance-ws', () => ({
  BinanceWebSocketClient: class {
    connect() { return mockBinanceClient.connect(); }
    disconnect() { return mockBinanceClient.disconnect(); }
    subscribe(symbols: string[]) { return mockBinanceClient.subscribe(symbols); }
    unsubscribe(symbols: string[]) { return mockBinanceClient.unsubscribe(symbols); }
    onMessage(handler: (msg: unknown) => void) { mockBinanceClient.onMessage(handler); }
  },
}));

vi.mock('../okx-ws', () => ({
  OKXWebSocketClient: class {
    connect() { return mockOKXClient.connect(); }
    disconnect() { return mockOKXClient.disconnect(); }
    subscribe(symbols: string[]) { return mockOKXClient.subscribe(symbols); }
    unsubscribe(symbols: string[]) { return mockOKXClient.unsubscribe(symbols); }
    onMessage(handler: (msg: unknown) => void) { mockOKXClient.onMessage(handler); }
  },
}));

vi.mock('../bybit-ws', () => ({
  BybitWebSocketClient: class {
    connect() { return mockBybitClient.connect(); }
    disconnect() { return mockBybitClient.disconnect(); }
    subscribe(symbols: string[]) { return mockBybitClient.subscribe(symbols); }
    unsubscribe(symbols: string[]) { return mockBybitClient.unsubscribe(symbols); }
    onMessage(handler: (msg: unknown) => void) { mockBybitClient.onMessage(handler); }
  },
}));

// ─── Import SUT after mocks ────────────────────────────────────────────────────

import { FeedAggregator } from '../feed-aggregator';
import type { FeedMessage } from '../feed-aggregator';
import type { BinanceOrderBook, BinanceTrade, BinanceTicker } from '../binance-ws';
import type { OKXOrderBook, OKXTrade, OKXTicker } from '../okx-ws';
import type { BybitOrderBook, BybitTrade, BybitTicker } from '../bybit-ws';
import type { WebSocketMessage } from '../websocket-client';

// ─── Test Fixtures ──────────────────────────────────────────────────────────────

const createBinanceOrderBook = (overrides: Partial<BinanceOrderBook> = {}): BinanceOrderBook => ({
  lastUpdateId: 123456789,
  bids: [['50000.0', '1.5'], ['49999.0', '2.0']],
  asks: [['50001.0', '1.0'], ['50002.0', '3.0']],
  ...overrides,
});

const createBinanceTrade = (overrides: Partial<BinanceTrade> = {}): BinanceTrade => ({
  e: 'trade',
  E: 1700000000000,
  s: 'BTCUSDT',
  t: 12345,
  p: '50000.5',
  q: '0.1',
  b: 100,
  a: 200,
  T: 1700000000000,
  m: false,
  ...overrides,
});

const createBinanceTicker = (overrides: Partial<BinanceTicker> = {}): BinanceTicker => ({
  e: '24hrTicker',
  E: 1700000000000,
  s: 'BTCUSDT',
  p: '1000',
  P: '2.0',
  c: '50000.0',
  o: '49000.0',
  h: '51000.0',
  l: '48000.0',
  v: '1000.5',
  q: '50000000.0',
  ...overrides,
});

const createOKXOrderBook = (overrides: Partial<OKXOrderBook> = {}): OKXOrderBook => ({
  seqId: 123456,
  asks: [['50001.0', '1.0', '5', '0'], ['50002.0', '3.0', '3', '0']],
  bids: [['50000.0', '1.5', '4', '0'], ['49999.0', '2.0', '6', '0']],
  timestamp: new Date().toISOString(),
  ...overrides,
});

const createOKXTrade = (overrides: Partial<OKXTrade> = {}): OKXTrade => ({
  instId: 'BTC-USDT',
  tradeId: '12345',
  px: '50000.5',
  sz: '0.1',
  side: 'buy',
  ts: '1700000000000',
  ...overrides,
});

const createOKXTicker = (overrides: Partial<OKXTicker> = {}): OKXTicker => ({
  instId: 'BTC-USDT',
  last: '50000.0',
  lastSz: '0.1',
  askPx: '50001.0',
  askSz: '1.0',
  bidPx: '50000.0',
  bidSz: '1.5',
  open24h: '49000.0',
  high24h: '51000.0',
  low24h: '48000.0',
  volCcyl24h: '1000.5',
  volUsd24h: '50000000.0',
  ts: '1700000000000',
  ...overrides,
});

const createBybitOrderBook = (overrides: Partial<BybitOrderBook> = {}): BybitOrderBook => ({
  seq: 123456,
  bids: [['50000.0', '1.5'], ['49999.0', '2.0']],
  asks: [['50001.0', '1.0'], ['50002.0', '3.0']],
  ts: 1700000000000,
  u: 789,
  ...overrides,
});

const createBybitTrade = (overrides: Partial<BybitTrade> = {}): BybitTrade => ({
  category: 'linear',
  symbol: 'BTCUSDT',
  execId: '12345',
  price: '50000.5',
  size: '0.1',
  side: 'Buy',
  time: '1700000000000',
  isBlockTrade: false,
  ...overrides,
});

const createBybitTicker = (overrides: Partial<BybitTicker> = {}): BybitTicker => ({
  category: 'linear',
  symbol: 'BTCUSDT',
  lastPrice: '50000.0',
  indexPrice: '50000.0',
  markPrice: '50000.0',
  prevPrice24h: '49000.0',
  price24hPcnt: '0.02',
  highPrice24h: '51000.0',
  lowPrice24h: '48000.0',
  prevPrice1h: '49500.0',
  volume24h: '1000.5',
  turnover24h: '50000000.0',
  fundingRate: '0.0001',
  nextFundingTime: '17000003600000',
  openInterest: '5000.0',
  openInterestValue: '250000000.0',
  ...overrides,
});

const createWebSocketMessage = <T>(
  type: 'orderbook' | 'trade' | 'ticker',
  exchange: string,
  symbol: string,
  data: T,
  timestamp = 1700000000000
): WebSocketMessage => ({
  type,
  exchange,
  symbol,
  data,
  timestamp,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────────

describe('FeedAggregator - Coverage', () => {
  let aggregator: FeedAggregator;

  beforeEach(() => {
    vi.clearAllMocks();
    aggregator = new FeedAggregator();
  });

  afterEach(async () => {
    if (aggregator.isConnected()) {
      await aggregator.disconnect();
    }
  });

  // ─── Initialization ──────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should initialize with disconnected state', () => {
      expect(aggregator.isConnected()).toBe(false);
    });

    it('should initialize three exchange clients', () => {
      const clients = (aggregator as unknown as { clients: Map<string, unknown> }).clients;
      expect(clients.has('binance')).toBe(true);
      expect(clients.has('okx')).toBe(true);
      expect(clients.has('bybit')).toBe(true);
    });
  });

  // ─── connect() ───────────────────────────────────────────────────────────────

  describe('connect()', () => {
    it('should connect to all three exchanges successfully', async () => {
      await aggregator.connect();

      expect(mockBinanceClient.connect).toHaveBeenCalledOnce();
      expect(mockOKXClient.connect).toHaveBeenCalledOnce();
      expect(mockBybitClient.connect).toHaveBeenCalledOnce();
      expect(aggregator.isConnected()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[FeedAggregator] Connecting to exchange WebSocket streams...'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('[FeedAggregator] binance connected');
      expect(mockLogger.info).toHaveBeenCalledWith('[FeedAggregator] okx connected');
      expect(mockLogger.info).toHaveBeenCalledWith('[FeedAggregator] bybit connected');
      expect(mockLogger.info).toHaveBeenCalledWith('[FeedAggregator] All exchanges connected');
    });

    it('should not reconnect if already connected', async () => {
      await aggregator.connect();
      vi.clearAllMocks();

      await aggregator.connect();

      expect(mockBinanceClient.connect).not.toHaveBeenCalled();
      expect(mockOKXClient.connect).not.toHaveBeenCalled();
      expect(mockBybitClient.connect).not.toHaveBeenCalled();
    });

    it('should throw and log error when binance connection fails', async () => {
      mockBinanceClient.connect.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(aggregator.connect()).rejects.toThrow('Connection refused');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[FeedAggregator] binance connection failed:',
        { error: expect.any(Error) }
      );
    });

    it('should throw and log error when okx connection fails', async () => {
      mockOKXClient.connect.mockRejectedValueOnce(new Error('Connection timeout'));

      await expect(aggregator.connect()).rejects.toThrow('Connection timeout');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[FeedAggregator] okx connection failed:',
        { error: expect.any(Error) }
      );
    });

    it('should throw and log error when bybit connection fails', async () => {
      mockBybitClient.connect.mockRejectedValueOnce(new Error('Network error'));

      await expect(aggregator.connect()).rejects.toThrow('Network error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[FeedAggregator] bybit connection failed:',
        { error: expect.any(Error) }
      );
    });
  });

  // ─── disconnect() ────────────────────────────────────────────────────────────

  describe('disconnect()', () => {
    it('should disconnect all exchanges and set connected to false', async () => {
      await aggregator.connect();
      vi.clearAllMocks();

      await aggregator.disconnect();

      expect(mockBinanceClient.disconnect).toHaveBeenCalledOnce();
      expect(mockOKXClient.disconnect).toHaveBeenCalledOnce();
      expect(mockBybitClient.disconnect).toHaveBeenCalledOnce();
      expect(aggregator.isConnected()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('[FeedAggregator] All exchanges disconnected');
    });

    it('should handle disconnect when not connected', async () => {
      await aggregator.disconnect();
      expect(aggregator.isConnected()).toBe(false);
    });
  });

  // ─── subscribe() ─────────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('should throw when subscribing before connecting', async () => {
      await expect(aggregator.subscribe(['BTC/USDT'])).rejects.toThrow(
        'FeedAggregator not connected. Call connect() first.'
      );
    });

    it('should subscribe to symbols on all exchanges', async () => {
      await aggregator.connect();
      vi.clearAllMocks();

      await aggregator.subscribe(['BTC/USDT', 'ETH/USDT']);

      expect(mockBinanceClient.subscribe).toHaveBeenCalledWith(['BTC/USDT', 'ETH/USDT']);
      expect(mockOKXClient.subscribe).toHaveBeenCalledWith(['BTC/USDT', 'ETH/USDT']);
      expect(mockBybitClient.subscribe).toHaveBeenCalledWith(['BTC/USDT', 'ETH/USDT']);
      expect(mockLogger.info).toHaveBeenCalledWith('[FeedAggregator] Subscribing to 2 symbols...');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[FeedAggregator] binance subscribed to BTC/USDT, ETH/USDT'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[FeedAggregator] okx subscribed to BTC/USDT, ETH/USDT'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[FeedAggregator] bybit subscribed to BTC/USDT, ETH/USDT'
      );
    });

    it('should set up message handlers after subscription', async () => {
      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);

      expect(mockBinanceClient.onMessage).toHaveBeenCalled();
      expect(mockOKXClient.onMessage).toHaveBeenCalled();
      expect(mockBybitClient.onMessage).toHaveBeenCalled();
    });

    it('should throw and log error when binance subscription fails', async () => {
      await aggregator.connect();
      mockBinanceClient.subscribe.mockRejectedValueOnce(new Error('Subscribe failed'));

      await expect(aggregator.subscribe(['BTC/USDT'])).rejects.toThrow('Subscribe failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[FeedAggregator] binance subscription failed:',
        { error: expect.any(Error) }
      );
    });

    it('should throw and log error when okx subscription fails', async () => {
      await aggregator.connect();
      mockOKXClient.subscribe.mockRejectedValueOnce(new Error('Subscribe failed'));

      await expect(aggregator.subscribe(['BTC/USDT'])).rejects.toThrow('Subscribe failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[FeedAggregator] okx subscription failed:',
        { error: expect.any(Error) }
      );
    });

    it('should throw and log error when bybit subscription fails', async () => {
      await aggregator.connect();
      mockBybitClient.subscribe.mockRejectedValueOnce(new Error('Subscribe failed'));

      await expect(aggregator.subscribe(['BTC/USDT'])).rejects.toThrow('Subscribe failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[FeedAggregator] bybit subscription failed:',
        { error: expect.any(Error) }
      );
    });
  });

  // ─── unsubscribe() ───────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('should unsubscribe from symbols on all exchanges', async () => {
      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);
      vi.clearAllMocks();

      await aggregator.unsubscribe(['BTC/USDT']);

      expect(mockBinanceClient.unsubscribe).toHaveBeenCalledWith(['BTC/USDT']);
      expect(mockOKXClient.unsubscribe).toHaveBeenCalledWith(['BTC/USDT']);
      expect(mockBybitClient.unsubscribe).toHaveBeenCalledWith(['BTC/USDT']);
    });
  });

  // ─── isConnected() ───────────────────────────────────────────────────────────

  describe('isConnected()', () => {
    it('should return true after connect', async () => {
      await aggregator.connect();
      expect(aggregator.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      await aggregator.connect();
      await aggregator.disconnect();
      expect(aggregator.isConnected()).toBe(false);
    });

    it('should return false initially', () => {
      expect(aggregator.isConnected()).toBe(false);
    });
  });

  // ─── getAverageLatency() ─────────────────────────────────────────────────────

  describe('getAverageLatency()', () => {
    it('should return 0 for unknown exchange:symbol', () => {
      const latency = aggregator.getAverageLatency('okx', 'ETH/USDT');
      expect(latency).toBe(0);
    });

    it('should calculate average latency correctly', () => {
      const key = 'binance:BTC/USDT';
      (aggregator as unknown as { latencies: Map<string, number[]> }).latencies.set(
        key,
        [10, 20, 30, 40, 50]
      );

      const avgLatency = aggregator.getAverageLatency('binance', 'BTC/USDT');
      expect(avgLatency).toBe(30);
    });

    it('should return 0 for empty latency array', () => {
      const key = 'okx:BTC/USDT';
      (aggregator as unknown as { latencies: Map<string, number[]> }).latencies.set(key, []);

      const avgLatency = aggregator.getAverageLatency('okx', 'BTC/USDT');
      expect(avgLatency).toBe(0);
    });
  });

  // ─── handleMessage() - OrderBook parsing ─────────────────────────────────────

  describe('handleMessage() - OrderBook parsing', () => {
    beforeEach(async () => {
      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);
    });

    it('should parse Binance orderbook and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const binanceBook = createBinanceOrderBook();
      const msg = createWebSocketMessage('orderbook', 'binance', 'BTCUSDT', binanceBook);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orderbook',
          data: expect.objectContaining({
            exchange: 'binance',
            bids: expect.arrayContaining([
              expect.objectContaining({ price: 50000, amount: 1.5 }),
            ]),
            asks: expect.arrayContaining([
              expect.objectContaining({ price: 50001, amount: 1 }),
            ]),
            latency: expect.any(Number),
          }),
        })
      );
    });

    it('should parse OKX orderbook and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const okxBook = createOKXOrderBook();
      const msg = createWebSocketMessage('orderbook', 'okx', 'BTC-USDT', okxBook);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('okx', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orderbook',
          data: expect.objectContaining({
            exchange: 'okx',
            bids: expect.arrayContaining([
              expect.objectContaining({ price: 50000, amount: 1.5 }),
            ]),
            asks: expect.arrayContaining([
              expect.objectContaining({ price: 50001, amount: 1 }),
            ]),
            latency: expect.any(Number),
          }),
        })
      );
    });

    it('should parse Bybit orderbook and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const bybitBook = createBybitOrderBook();
      const msg = createWebSocketMessage('orderbook', 'bybit', 'BTCUSDT', bybitBook);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('bybit', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orderbook',
          data: expect.objectContaining({
            exchange: 'bybit',
            bids: expect.arrayContaining([
              expect.objectContaining({ price: 50000, amount: 1.5 }),
            ]),
            asks: expect.arrayContaining([
              expect.objectContaining({ price: 50001, amount: 1 }),
            ]),
            latency: expect.any(Number),
          }),
        })
      );
    });

    it('should return null for unknown exchange in parseOrderBook', () => {
      const msg = createWebSocketMessage('orderbook', 'unknown', 'BTC/USDT', {});

      const result = (aggregator as unknown as {
        parseOrderBook: (ex: string, data: unknown) => unknown;
      }).parseOrderBook('unknown', msg.data);

      expect(result).toBeNull();
    });
  });

  // ─── handleMessage() - Trade parsing ─────────────────────────────────────────

  describe('handleMessage() - Trade parsing', () => {
    beforeEach(async () => {
      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);
    });

    it('should parse Binance trade (buy) and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const binanceTrade = createBinanceTrade({ m: false });
      const msg = createWebSocketMessage('trade', 'binance', 'BTCUSDT', binanceTrade);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          data: expect.objectContaining({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            price: 50000.5,
            amount: 0.1,
            side: 'buy',
            tradeId: '12345',
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should parse Binance trade with m=true as sell', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const binanceTrade = createBinanceTrade({ m: true });
      const msg = createWebSocketMessage('trade', 'binance', 'BTCUSDT', binanceTrade);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          data: expect.objectContaining({ side: 'sell' }),
        })
      );
    });

    it('should parse OKX trade with side=buy', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const okxTrade = createOKXTrade({ side: 'buy' });
      const msg = createWebSocketMessage('trade', 'okx', 'BTC-USDT', okxTrade);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('okx', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          data: expect.objectContaining({
            exchange: 'okx',
            symbol: 'BTC/USDT',
            price: 50000.5,
            amount: 0.1,
            side: 'buy',
            tradeId: '12345',
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should parse OKX trade with side=sell', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const okxTrade = createOKXTrade({ side: 'sell' });
      const msg = createWebSocketMessage('trade', 'okx', 'BTC-USDT', okxTrade);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('okx', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          data: expect.objectContaining({ side: 'sell' }),
        })
      );
    });

    it('should parse Bybit trade with side=Buy', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const bybitTrade = createBybitTrade({ side: 'Buy' });
      const msg = createWebSocketMessage('trade', 'bybit', 'BTCUSDT', bybitTrade);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('bybit', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          data: expect.objectContaining({
            exchange: 'bybit',
            symbol: 'BTCUSDT',
            price: 50000.5,
            amount: 0.1,
            side: 'buy',
            tradeId: '12345',
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should parse Bybit trade with side=Sell', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const bybitTrade = createBybitTrade({ side: 'Sell' });
      const msg = createWebSocketMessage('trade', 'bybit', 'BTCUSDT', bybitTrade);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('bybit', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trade',
          data: expect.objectContaining({ side: 'sell' }),
        })
      );
    });

    it('should return null for unknown exchange in parseTrade', () => {
      const msg = createWebSocketMessage('trade', 'unknown', 'BTC/USDT', {});

      const result = (aggregator as unknown as {
        parseTrade: (ex: string, data: unknown) => unknown;
      }).parseTrade('unknown', msg.data);

      expect(result).toBeNull();
    });
  });

  // ─── handleMessage() - Ticker parsing ────────────────────────────────────────

  describe('handleMessage() - Ticker parsing', () => {
    beforeEach(async () => {
      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);
    });

    it('should parse Binance ticker and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const binanceTicker = createBinanceTicker();
      const msg = createWebSocketMessage('ticker', 'binance', 'BTCUSDT', binanceTicker);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ticker',
          data: expect.objectContaining({
            exchange: 'binance',
            symbol: 'BTCUSDT',
            last: 50000,
            bid: 0,
            ask: 0,
            high24h: 51000,
            low24h: 48000,
            volume24h: 1000.5,
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should parse OKX ticker and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const okxTicker = createOKXTicker();
      const msg = createWebSocketMessage('ticker', 'okx', 'BTC-USDT', okxTicker);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('okx', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ticker',
          data: expect.objectContaining({
            exchange: 'okx',
            symbol: 'BTC/USDT',
            last: 50000,
            bid: 50000,
            ask: 50001,
            high24h: 51000,
            low24h: 48000,
            volume24h: 50000000,
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should parse Bybit ticker and notify handlers', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const bybitTicker = createBybitTicker();
      const msg = createWebSocketMessage('ticker', 'bybit', 'BTCUSDT', bybitTicker);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('bybit', msg);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ticker',
          data: expect.objectContaining({
            exchange: 'bybit',
            symbol: 'BTCUSDT',
            last: 50000,
            bid: 0,
            ask: 0,
            high24h: 51000,
            low24h: 48000,
            volume24h: 1000.5,
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should return null for unknown exchange in parseTicker', () => {
      const msg = createWebSocketMessage('ticker', 'unknown', 'BTC/USDT', {});

      const result = (aggregator as unknown as {
        parseTicker: (ex: string, data: unknown) => unknown;
      }).parseTicker('unknown', msg.data);

      expect(result).toBeNull();
    });
  });

  // ─── handleMessage() - Unknown message type ──────────────────────────────────

  describe('handleMessage() - Unknown message type', () => {
    it('should not call notify for unknown message type', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const msg = createWebSocketMessage('heartbeat' as 'orderbook', 'binance', 'BTCUSDT', {});

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not call notify when parseOrderBook returns null (unknown exchange)', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const msg = createWebSocketMessage('orderbook', 'unknown', 'BTC/USDT', {});

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('unknown', msg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not call notify when parseTrade returns null (unknown exchange)', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const msg = createWebSocketMessage('trade', 'unknown', 'BTC/USDT', {});

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('unknown', msg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not call notify when parseTicker returns null (unknown exchange)', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const msg = createWebSocketMessage('ticker', 'unknown', 'BTC/USDT', {});

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('unknown', msg);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── parseOrderBook() direct ─────────────────────────────────────────────────

  describe('parseOrderBook()', () => {
    it('should parse Binance orderbook with correct price/amount conversion', () => {
      const binanceBook = createBinanceOrderBook({
        bids: [['100.5', '10.2'], ['100.0', '5.5']],
        asks: [['101.0', '3.0'], ['102.0', '7.0']],
      });

      const result = (aggregator as unknown as {
        parseOrderBook: (ex: string, data: unknown) => { bids: unknown; asks: unknown };
      }).parseOrderBook('binance', binanceBook);

      expect(result).not.toBeNull();
      expect(result!.bids).toEqual([
        { price: 100.5, amount: 10.2 },
        { price: 100, amount: 5.5 },
      ]);
      expect(result!.asks).toEqual([
        { price: 101, amount: 3 },
        { price: 102, amount: 7 },
      ]);
    });

    it('should parse OKX orderbook with 4-element arrays', () => {
      const okxBook = createOKXOrderBook({
        bids: [['100.5', '10.2', '5', '0'], ['100.0', '5.5', '3', '0']],
        asks: [['101.0', '3.0', '2', '0'], ['102.0', '7.0', '1', '0']],
      });

      const result = (aggregator as unknown as {
        parseOrderBook: (ex: string, data: unknown) => { bids: unknown; asks: unknown };
      }).parseOrderBook('okx', okxBook);

      expect(result).not.toBeNull();
      expect(result!.bids).toEqual([
        { price: 100.5, amount: 10.2 },
        { price: 100, amount: 5.5 },
      ]);
      expect(result!.asks).toEqual([
        { price: 101, amount: 3 },
        { price: 102, amount: 7 },
      ]);
    });

    it('should parse Bybit orderbook correctly', () => {
      const bybitBook = createBybitOrderBook({
        bids: [['100.5', '10.2'], ['100.0', '5.5']],
        asks: [['101.0', '3.0'], ['102.0', '7.0']],
      });

      const result = (aggregator as unknown as {
        parseOrderBook: (ex: string, data: unknown) => { bids: unknown; asks: unknown };
      }).parseOrderBook('bybit', bybitBook);

      expect(result).not.toBeNull();
      expect(result!.bids).toEqual([
        { price: 100.5, amount: 10.2 },
        { price: 100, amount: 5.5 },
      ]);
      expect(result!.asks).toEqual([
        { price: 101, amount: 3 },
        { price: 102, amount: 7 },
      ]);
    });
  });

  // ─── parseTrade() direct ─────────────────────────────────────────────────────

  describe('parseTrade()', () => {
    it('should parse Binance trade with all fields', () => {
      const binanceTrade = createBinanceTrade({
        p: '50000.123',
        q: '0.567',
        t: 99999,
        T: 1700000000000,
      });

      const result = (aggregator as unknown as {
        parseTrade: (ex: string, data: unknown) => unknown;
      }).parseTrade('binance', binanceTrade);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        price: 50000.123,
        amount: 0.567,
        side: 'buy',
        timestamp: 1700000000000,
        tradeId: '99999',
      });
    });

    it('should parse OKX trade with instId conversion', () => {
      const okxTrade = createOKXTrade({
        instId: 'ETH-USDT',
        px: '3000.5',
        sz: '2.0',
        tradeId: '88888',
        ts: '1700000001000',
      });

      const result = (aggregator as unknown as {
        parseTrade: (ex: string, data: unknown) => unknown;
      }).parseTrade('okx', okxTrade);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        exchange: 'okx',
        symbol: 'ETH/USDT',
        price: 3000.5,
        amount: 2,
        side: 'buy',
        timestamp: 1700000001000,
        tradeId: '88888',
      });
    });

    it('should parse Bybit trade with side conversion', () => {
      const bybitTrade = createBybitTrade({
        symbol: 'ETHUSDT',
        price: '3000.5',
        size: '2.0',
        side: 'Sell',
        execId: '77777',
        time: '1700000002000',
      });

      const result = (aggregator as unknown as {
        parseTrade: (ex: string, data: unknown) => unknown;
      }).parseTrade('bybit', bybitTrade);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        exchange: 'bybit',
        symbol: 'ETHUSDT',
        price: 3000.5,
        amount: 2,
        side: 'sell',
        timestamp: 1700000002000,
        tradeId: '77777',
      });
    });
  });

  // ─── parseTicker() direct ────────────────────────────────────────────────────

  describe('parseTicker()', () => {
    it('should parse Binance ticker with all fields', () => {
      const binanceTicker = createBinanceTicker({
        c: '50123.45',
        h: '51000.0',
        l: '49000.0',
        v: '2000.0',
        E: 1700000000000,
      });

      const result = (aggregator as unknown as {
        parseTicker: (ex: string, data: unknown) => unknown;
      }).parseTicker('binance', binanceTicker);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        last: 50123.45,
        bid: 0,
        ask: 0,
        high24h: 51000,
        low24h: 49000,
        volume24h: 2000,
        timestamp: 1700000000000,
      });
    });

    it('should parse OKX ticker with bid/ask', () => {
      const okxTicker = createOKXTicker({
        instId: 'ETH-USDT',
        last: '3000.5',
        bidPx: '3000.0',
        askPx: '3001.0',
        high24h: '3100.0',
        low24h: '2900.0',
        volUsd24h: '10000000.0',
        ts: '1700000001000',
      });

      const result = (aggregator as unknown as {
        parseTicker: (ex: string, data: unknown) => unknown;
      }).parseTicker('okx', okxTicker);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        exchange: 'okx',
        symbol: 'ETH/USDT',
        last: 3000.5,
        bid: 3000,
        ask: 3001,
        high24h: 3100,
        low24h: 2900,
        volume24h: 10000000,
        timestamp: 1700000001000,
      });
    });

    it('should parse Bybit ticker with volume24h', () => {
      const bybitTicker = createBybitTicker({
        symbol: 'ETHUSDT',
        lastPrice: '3000.5',
        highPrice24h: '3100.0',
        lowPrice24h: '2900.0',
        volume24h: '2000.0',
      });

      const result = (aggregator as unknown as {
        parseTicker: (ex: string, data: unknown) => unknown;
      }).parseTicker('bybit', bybitTicker);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        exchange: 'bybit',
        symbol: 'ETHUSDT',
        last: 3000.5,
        bid: 0,
        ask: 0,
        high24h: 3100,
        low24h: 2900,
        volume24h: 2000,
        timestamp: expect.any(Number),
      });
    });
  });

  // ─── notify() / offFeed() ─────────────────────────────────────────────────────

  describe('notify() / handler management', () => {
    it('should call all registered handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      aggregator.onFeed(handler1);
      aggregator.onFeed(handler2);
      aggregator.onFeed(handler3);

      const msg: FeedMessage = {
        type: 'trade',
        data: {
          exchange: 'binance',
          symbol: 'BTC/USDT',
          price: 50000,
          amount: 1,
          side: 'buy',
          timestamp: 1700000000000,
        },
      };
      (aggregator as unknown as { notify: (m: FeedMessage) => void }).notify(msg);

      expect(handler1).toHaveBeenCalledWith(msg);
      expect(handler2).toHaveBeenCalledWith(msg);
      expect(handler3).toHaveBeenCalledWith(msg);
    });

    it('should not call removed handlers after offFeed', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);
      aggregator.offFeed(handler);

      const msg: FeedMessage = {
        type: 'trade',
        data: {
          exchange: 'binance',
          symbol: 'BTC/USDT',
          price: 50000,
          amount: 1,
          side: 'buy',
          timestamp: 1700000000000,
        },
      };
      (aggregator as unknown as { notify: (m: FeedMessage) => void }).notify(msg);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─── Latency tracking ─────────────────────────────────────────────────────────

  describe('Latency tracking', () => {
    beforeEach(async () => {
      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);
    });

    it('should track latency per exchange:symbol via handleMessage', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      const binanceTrade = createBinanceTrade({ E: 1700000000000 });
      const msg = createWebSocketMessage('trade', 'binance', 'BTCUSDT', binanceTrade, 1700000000000);

      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      const latency = aggregator.getAverageLatency('binance', 'BTCUSDT');
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('should track latency across multiple messages', () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      // Use fake timers: set system time to match message timestamp so latency = 0
      vi.useFakeTimers();
      vi.setSystemTime(1700000000000);

      for (let i = 0; i < 5; i++) {
        const binanceTrade = createBinanceTrade({ E: 1700000000000, T: 1700000000000 });
        const msg = createWebSocketMessage('trade', 'binance', 'BTCUSDT', binanceTrade, 1700000000000);
        (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
          .handleMessage('binance', msg);
      }

      const latency = aggregator.getAverageLatency('binance', 'BTCUSDT');
      expect(latency).toBe(0);

      vi.useRealTimers();
    });

    it('should maintain max 100 latency samples', () => {
      const internal = aggregator as unknown as { latencies: Map<string, number[]> };
      // Key must match what handleMessage uses: exchange + ':' + msg.symbol (BTCUSDT, no slash for binance)
      const key = 'binance:BTCUSDT';
      // Pre-populate with exactly 100 samples
      const latencies = Array.from({ length: 100 }, (_, i) => i);
      internal.latencies.set(key, latencies);

      // Send a message to trigger the >100 cleanup (100 + 1 = 101 > 100 → shift → 100)
      const binanceTrade = createBinanceTrade({ E: 1700000000000 });
      const msg = createWebSocketMessage('trade', 'binance', 'BTCUSDT', binanceTrade, 1700000000000);
      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      // After 100 samples + 1 new one = 101, shift should drop to 100
      const result = internal.latencies.get(key)!;
      expect(result.length).toBe(100);
    });
  });

  // ─── Full integration flow ───────────────────────────────────────────────────

  describe('Full integration flow', () => {
    it('should handle complete connect -> subscribe -> message flow', async () => {
      const handler = vi.fn();
      aggregator.onFeed(handler);

      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);

      const binanceBook = createBinanceOrderBook();
      const msg = createWebSocketMessage('orderbook', 'binance', 'BTCUSDT', binanceBook);
      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', msg);

      // parseOrderBook returns symbol: '' (empty string) - symbol is in message context
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'orderbook',
          data: expect.objectContaining({
            exchange: 'binance',
            symbol: '',
          }),
        })
      );

      await aggregator.disconnect();
      expect(aggregator.isConnected()).toBe(false);
    });

    it('should handle multiple handlers for different message types', async () => {
      const orderbookHandler = vi.fn();
      const tradeHandler = vi.fn();
      const tickerHandler = vi.fn();

      aggregator.onFeed((msg) => {
        if (msg.type === 'orderbook') orderbookHandler(msg);
        else if (msg.type === 'trade') tradeHandler(msg);
        else if (msg.type === 'ticker') tickerHandler(msg);
      });

      await aggregator.connect();
      await aggregator.subscribe(['BTC/USDT']);

      const binanceBook = createBinanceOrderBook();
      const obMsg = createWebSocketMessage('orderbook', 'binance', 'BTCUSDT', binanceBook);
      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', obMsg);

      const binanceTrade = createBinanceTrade();
      const tradeMsg = createWebSocketMessage('trade', 'binance', 'BTCUSDT', binanceTrade);
      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', tradeMsg);

      const binanceTicker = createBinanceTicker();
      const tickerMsg = createWebSocketMessage('ticker', 'binance', 'BTCUSDT', binanceTicker);
      (aggregator as unknown as { handleMessage: (ex: string, m: WebSocketMessage) => void })
        .handleMessage('binance', tickerMsg);

      expect(orderbookHandler).toHaveBeenCalledTimes(1);
      expect(tradeHandler).toHaveBeenCalledTimes(1);
      expect(tickerHandler).toHaveBeenCalledTimes(1);
    });
  });
});
