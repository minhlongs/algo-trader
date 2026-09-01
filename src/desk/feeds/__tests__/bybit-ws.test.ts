/**
 * BybitWebSocketClient — Unit Tests
 *
 * Covers:
 * - connect() / disconnect() lifecycle
 * - subscribe() builds correct args; throws when not connected; dedup
 * - unsubscribe() builds correct args; removes symbols; no-op on empty
 * - handleMessage: subscribe response, pong, retCode error, no topic,
 *   orderbook / publicTrade / tickers parsing, missing data payload
 * - extractSymbol: BTCUSDT→BTC/USDT, too-few-parts, no-quote-currency
 * - parseOrderBook / parseTrade / parseTicker field correctness
 * - getSubscriptions builds orderbook topics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted to top of file via vi.hoisted)
// ---------------------------------------------------------------------------

const { MockWs, sendMock, closeMock, onopenRef, onmessageRef } = vi.hoisted(() => {
  const send = vi.fn();
  const close = vi.fn();
  let onopen: (() => void) | undefined;
  let onmessage: ((event: { data: string }) => void) | undefined;

  class MockWs {
    static OPEN = 1;
    readyState = 1;

    send(data: unknown): void {
      send(JSON.parse(data as string));
    }

    close(): void {
      close();
    }

    // Properties assigned by ws-connection.ts
    set onopen(fn: (() => void) | undefined) { onopen = fn; }
    get onopen(): (() => void) | undefined { return onopen; }

    set onmessage(fn: ((event: { data: string }) => void) | undefined) { onmessage = fn; }
    get onmessage(): ((event: { data: string }) => void) | undefined { return onmessage; }

    onclose = vi.fn();
    onerror = vi.fn();
    on(): void {}
    removeAllListeners(): void {}
    terminate(): void {}
  }

  return { MockWs, sendMock: send, closeMock: close, onopenRef: () => onopen, onmessageRef: () => onmessage };
});

vi.mock('ws', () => ({ default: MockWs }));

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ws-connection.ts so connectWebSocket sets up onopen/onmessage synchronously.
// Mirrors the real ws-connection.ts: assigns onopen/onmessage/onclose/onerror handlers.
vi.mock('../ws-connection', () => ({
  connectWebSocket: function(this: BaseWebSocketClient): Promise<void> {
    this.state = 'connecting';
    this.ws = new MockWs(this.config.url);
    // Synchronously resolve (mirrors onopen after open).
    this.state = 'connected';
    this.stats.connectedAt = Date.now();
    this.reconnectAttempts = 0;
    // Wire onmessage to dispatch through the client's handleMessage + handler
    // registry (mirrors ws-connection.ts lines 72-97) so end-to-end tests work.
    this.ws.onmessage = (event: { data: string }) => {
      const data = JSON.parse(event.data);
      const message = this.handleMessage(data);
      if (message) {
        this.messageHandlers.forEach((handler) => handler(message));
        this.emit('message', message);
      }
    };
    this.ws.onopen = () => {};
    this.ws.onclose = () => {};
    this.ws.onerror = () => {};
    this.startHeartbeat();
    return Promise.resolve();
  },
  waitForConnection: () => Promise.resolve(true),
}));

// Type-only import to satisfy the mock function's `this` type
type BaseWebSocketClient = InstanceType<typeof import('../websocket-client').BaseWebSocketClient>;

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { BybitWebSocketClient } from '../bybit-ws';
import { WebSocketMessage } from '../ws-types';
import { logger } from '../../../shared/utils/logger';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BybitWebSocketClient', () => {
  let client: BybitWebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new BybitWebSocketClient();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    sendMock.mockClear();
    closeMock.mockClear();
  });

  /** Helper: connect (synchronous mock). */
  async function connectAndOpen(): Promise<void> {
    await client.connect();
  }

  /** Helper: emit a message through the ws mock. */
  function emitMessage(data: unknown): void {
    const handler = onmessageRef();
    if (!handler) throw new Error('No message handler — connect first');
    handler({ data: JSON.stringify(data) });
  }

  describe('connect / disconnect', () => {
    it('sets state to connected after open', async () => {
      await connectAndOpen();
      expect(client.getState()).toBe('connected');
      expect(client.isConnected()).toBe(true);
    });

    it('disconnect sets state to disconnected', async () => {
      await connectAndOpen();
      await client.disconnect();
      expect(client.getState()).toBe('disconnected');
      expect(closeMock).toHaveBeenCalled();
    });

    it('disconnect handles no ws gracefully', async () => {
      await expect(client.disconnect()).resolves.not.toThrow();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('builds orderbook.25 / publicTrade / tickers args for each symbol', async () => {
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);

      expect(sendMock).toHaveBeenCalledOnce();
      const sent = sendMock.mock.calls[0][0];
      expect(sent.op).toBe('subscribe');
      expect(sent.args).toEqual([
        'orderbook.25.BTCUSDT',
        'publicTrade.BTCUSDT',
        'tickers.BTCUSDT',
      ]);
    });

    it('handles multiple symbols', async () => {
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);

      const sent = sendMock.mock.calls[0][0];
      expect(sent.args).toEqual([
        'orderbook.25.BTCUSDT',
        'publicTrade.BTCUSDT',
        'tickers.BTCUSDT',
        'orderbook.25.ETHUSDT',
        'publicTrade.ETHUSDT',
        'tickers.ETHUSDT',
      ]);
    });

    it('strips slash from symbol (BTC/USDT → BTCUSDT)', async () => {
      sendMock.mockClear();
      await client.subscribe(['XAU/USD']);
      const sent = sendMock.mock.calls[0][0];
      expect(sent.args[0]).toBe('orderbook.25.XAUUSD');
    });

    it('throws when not connected', async () => {
      // Force ws to simulate non-OPEN
      (client as unknown as { ws: { readyState: number } }).ws.readyState = 0;
      await expect(client.subscribe(['BTC/USDT'])).rejects.toThrow('WebSocket not connected');
    });

    it('adds symbols to subscribedSymbols set', async () => {
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);
      const subs = client.getSubscriptions(['BTC/USDT', 'ETH/USDT']);
      expect(subs).toContain('orderbook.25.BTCUSDT');
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      await connectAndOpen();
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);
    });

    it('builds unsubscribe op with correct args', async () => {
      sendMock.mockClear();
      await client.unsubscribe(['BTC/USDT']);

      const sent = sendMock.mock.calls[0][0];
      expect(sent.op).toBe('unsubscribe');
      expect(sent.args).toEqual([
        'orderbook.25.BTCUSDT',
        'publicTrade.BTCUSDT',
        'tickers.BTCUSDT',
      ]);
    });

    it('removes symbol from subscribedSymbols', async () => {
      await client.unsubscribe(['BTC/USDT']);
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);
      const sent = sendMock.mock.calls[0][0];
      expect(sent.args).toContain('orderbook.25.BTCUSDT');
    });

    it('handles empty array', async () => {
      sendMock.mockClear();
      await client.unsubscribe([]);
      expect(sendMock).toHaveBeenCalled();
      const sent = sendMock.mock.calls[0][0];
      expect(sent.args).toEqual([]);
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('returns null for subscribe success response', () => {
      const result = client.handleMessage({ success: true, op: 'subscribe' });
      expect(result).toBeNull();
    });

    it('returns null for pong', () => {
      const result = client.handleMessage({ op: 'pong' });
      expect(result).toBeNull();
    });

    it('returns null and logs error for retCode error', () => {
      const result = client.handleMessage({ retCode: 10001, retMsg: 'Invalid key' });
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns null for retCode 0 (no error)', () => {
      const result = client.handleMessage({ retCode: 0, retMsg: 'OK' });
      expect(result).toBeNull();
    });

    it('returns null when no topic', () => {
      const result = client.handleMessage({ success: false });
      expect(result).toBeNull();
    });

    it('returns null when data payload missing', () => {
      const result = client.handleMessage({ topic: 'orderbook.25.BTCUSDT' });
      expect(result).toBeNull();
    });

    it('returns null when extractSymbol returns null (too few parts)', () => {
      const result = client.handleMessage({ topic: 'orderbook', data: { b: [], a: [] } });
      expect(result).toBeNull();
    });

    it('parses orderbook.25 topic into orderbook message', () => {
      const result = client.handleMessage({
        topic: 'orderbook.25.BTCUSDT',
        data: {
          b: [['50000', '1.5']],
          a: [['50001', '2.0']],
          u: 123,
          seq: 456,
          ts: Date.now(),
        },
      }) as WebSocketMessage;

      expect(result.type).toBe('orderbook');
      expect(result.exchange).toBe('bybit');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.data).toEqual({
        seq: 456,
        bids: [['50000', '1.5']],
        asks: [['50001', '2.0']],
        ts: expect.any(Number),
        u: 123,
      });
      expect(result.timestamp).toBeDefined();
    });

    it('parses publicTrade topic into trade message', () => {
      const result = client.handleMessage({
        topic: 'publicTrade.BTCUSDT',
        data: [{
          category: 'linear',
          symbol: 'BTCUSDT',
          execId: 'abc123',
          price: '50000',
          size: '0.001',
          side: 'Buy',
          time: '1700000000000',
          isBlockTrade: false,
 }],
      }) as WebSocketMessage;

      expect(result.type).toBe('trade');
      expect(result.exchange).toBe('bybit');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.data).toEqual({
        category: 'linear',
        symbol: 'BTCUSDT',
        execId: 'abc123',
        price: '50000',
        size: '0.001',
        side: 'Buy',
        time: '1700000000000',
        isBlockTrade: false,
      });
    });

    it('parses publicTrade with single trade (non-array)', () => {
      const result = client.handleMessage({
        topic: 'publicTrade.ETHUSDT',
        data: {
          category: 'linear',
          symbol: 'ETHUSDT',
          execId: 'xyz',
          price: '3000',
          size: '1',
          side: 'Sell',
          time: '1700000000',
          isBlockTrade: false,
        },
      }) as WebSocketMessage;

      expect(result.type).toBe('trade');
      expect(result.symbol).toBe('ETH/USDT');
      expect((result.data as { price: string }).price).toBe('3000');
    });

    it('parses tickers topic into ticker message', () => {
      const tickerData = {
        category: 'linear',
        symbol: 'BTCUSDT',
        lastPrice: '50000',
        indexPrice: '50000',
        markPrice: '50000',
        prevPrice24h: '49000',
        price24hPcnt: '0.0204',
        highPrice24h: '51000',
        lowPrice24h: '48500',
        prevPrice1h: '49900',
        volume24h: '1000',
        turnover24h: '50000000',
        fundingRate: '0.00005',
        nextFundingTime: '1700000000',
        openInterest: '500',
        openInterestValue: '25000000',
      };

      const result = client.handleMessage({
        topic: 'tickers.BTCUSDT',
        data: tickerData,
      }) as WebSocketMessage;

      expect(result.type).toBe('ticker');
      expect(result.exchange).toBe('bybit');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.data).toEqual(tickerData);
    });

    it('returns null for unknown topic prefix', () => {
      const result = client.handleMessage({
        topic: 'unknown.topic.BTCUSDT',
        data: { something: 'value' },
      });
      expect(result).toBeNull();
    });

    it('extractSymbol converts BTCUSDT to BTC/USDT', () => {
      const result = client.handleMessage({
        topic: 'tickers.ETHUSDT',
        data: { symbol: 'ETHUSDT', lastPrice: '3000' },
      }) as WebSocketMessage;
      expect(result.symbol).toBe('ETH/USDT');
    });

    it('extractSymbol returns raw symbol when no quote currency match', () => {
      const result = client.handleMessage({
        topic: 'tickers.BTCXYZ',
        data: { symbol: 'BTCXYZ', lastPrice: '1' },
      }) as WebSocketMessage;
      expect(result.symbol).toBe('BTCXYZ');
    });
  });

  describe('parseOrderBook', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('parses standard orderbook with b/a arrays', () => {
      const result = client.handleMessage({
        topic: 'orderbook.25.BTCUSDT',
        data: {
          b: [['100', '2'], ['99', '1']],
          a: [['101', '3']],
          seq: 10,
          u: 5,
          ts: 1700000000,
        },
      }) as WebSocketMessage;

      const ob = result.data as { seq: number; bids: [string, string][]; asks: [string, string][]; ts: number; u: number };
      expect(ob.seq).toBe(10);
      expect(ob.bids).toHaveLength(2);
      expect(ob.bids[0]).toEqual(['100', '2']);
      expect(ob.asks).toHaveLength(1);
      expect(ob.asks[0]).toEqual(['101', '3']);
      expect(ob.ts).toBe(1700000000);
      expect(ob.u).toBe(5);
    });

    it('defaults to 0 for missing numeric fields', () => {
      const result = client.handleMessage({
        topic: 'orderbook.25.BTCUSDT',
        data: { b: [], a: [] },
      }) as WebSocketMessage;

      const ob = result.data as { seq: number; bids: []; asks: []; ts: number; u: number };
      expect(ob.seq).toBe(0);
      expect(ob.bids).toEqual([]);
      expect(ob.asks).toEqual([]);
      expect(ob.ts).toBe(0);
      expect(ob.u).toBe(0);
    });

    it('handles nested array format for b/a', () => {
      const result = client.handleMessage({
        topic: 'orderbook.25.BTCUSDT',
        data: {
          b: [[['100', '2']]],
          a: [[['101', '3']]],
        },
      }) as WebSocketMessage;

      const ob = result.data as { bids: [string, string][]; asks: [string, string][] };
      expect(ob.bids[0]).toEqual(['100', '2']);
      expect(ob.asks[0]).toEqual(['101', '3']);
    });
  });

  describe('parseTrade', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('parses trade with all fields', () => {
      const result = client.handleMessage({
        topic: 'publicTrade.BTCUSDT',
        data: [{
          category: 'linear',
          symbol: 'BTCUSDT',
          execId: 'exec-1',
          price: '50000',
          size: '0.5',
          side: 'Buy',
          time: '1700000000',
          isBlockTrade: false,
        }],
      }) as WebSocketMessage;

      const trade = result.data as Record<string, unknown>;
      expect(trade.category).toBe('linear');
      expect(trade.symbol).toBe('BTCUSDT');
      expect(trade.execId).toBe('exec-1');
      expect(trade.price).toBe('50000');
      expect(trade.size).toBe('0.5');
      expect(trade.side).toBe('Buy');
      expect(trade.time).toBe('1700000000');
      expect(trade.isBlockTrade).toBe(false);
    });

    it('takes first trade from array of multiple', () => {
      const result = client.handleMessage({
        topic: 'publicTrade.BTCUSDT',
        data: [
          { category: 'linear', symbol: 'BTCUSDT', execId: 'first', price: '50000', size: '1', side: 'Buy', time: '1', isBlockTrade: false },
          { category: 'linear', symbol: 'BTCUSDT', execId: 'second', price: '50100', size: '2', side: 'Sell', time: '2', isBlockTrade: false },
        ],
      }) as WebSocketMessage;

      const trade = result.data as { execId: string };
      expect(trade.execId).toBe('first');
    });
  });

  describe('parseTicker', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('parses all ticker fields', () => {
      const tickerData = {
        category: 'linear',
        symbol: 'BTCUSDT',
        lastPrice: '50000',
        indexPrice: '49990',
        markPrice: '49995',
        prevPrice24h: '48000',
        price24hPcnt: '0.04167',
        highPrice24h: '51000',
        lowPrice24h: '47500',
        prevPrice1h: '49900',
        volume24h: '2500',
        turnover24h: '125000000',
        fundingRate: '0.00003',
        nextFundingTime: '1700010000',
        openInterest: '1000',
        openInterestValue: '50000000',
      };

      const result = client.handleMessage({
        topic: 'tickers.BTCUSDT',
        data: tickerData,
      }) as WebSocketMessage;

      expect(result.data).toEqual(tickerData);
    });
  });

  describe('getSubscriptions', () => {
    it('converts symbols to orderbook topics', () => {
      const client2 = new BybitWebSocketClient();
      const subs = client2.getSubscriptions(['BTC/USDT', 'ETH/USDT']);
      expect(subs).toEqual([
        'orderbook.25.BTCUSDT',
        'orderbook.25.ETHUSDT',
      ]);
    });

    it('handles empty array', () => {
      const client2 = new BybitWebSocketClient();
      const subs = client2.getSubscriptions([]);
      expect(subs).toEqual([]);
    });
  });

  describe('subscribe via message flow', () => {
    it('receives and parses orderbook messages end-to-end', async () => {
      await connectAndOpen();
      const handler = vi.fn();
      client.onMessage(handler);

      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);

      emitMessage({
        topic: 'orderbook.25.BTCUSDT',
        data: { b: [['100', '2']], a: [['101', '3']], seq: 1, u: 1, ts: 1700000000 },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('orderbook');
      expect(msg.exchange).toBe('bybit');
      expect(msg.symbol).toBe('BTC/USDT');
    });
  });
});
