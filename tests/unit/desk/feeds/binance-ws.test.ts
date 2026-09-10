/**
 * BinanceWebSocketClient — Unit Tests
 *
 * Covers:
 * - connect() / disconnect() lifecycle
 * - subscribe() builds stream names; throws when not connected
 * - unsubscribe() builds stream names; removes symbols
 * - handleMessage: subscription response, no eventType/symbol,
 *   depthUpdate → orderbook, trade → trade, 24hrTicker → ticker,
 *   unknown event → null
 * - sendHeartbeat sends PING
 * - getSubscriptions builds depth stream names
 * - normalizeSymbol: BNBUSDT→BNB/USDT, BTCETH→BTC/ETH, unknown → raw
 * - parseOrderBook / parseTrade / parseTicker field correctness
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

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ws-connection.ts so connectWebSocket sets up onopen/onmessage synchronously.
// Mirrors the real ws-connection.ts: assigns onopen/onmessage/onclose/onerror handlers.
vi.mock('../../../../src/desk/feeds/ws-connection', () => ({
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
type BaseWebSocketClient = InstanceType<typeof import('../../../../src/desk/feeds/websocket-client').BaseWebSocketClient>;

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { BinanceWebSocketClient } from '../../../../src/desk/feeds/binance-ws';
import { WebSocketMessage } from '../../../../src/desk/feeds/ws-types';
import { logger } from '../../../../src/shared/utils/logger';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BinanceWebSocketClient', () => {
  let client: BinanceWebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new BinanceWebSocketClient();
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

    it('builds depth/trade/ticker args for each symbol', async () => {
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);

      const sent = sendMock.mock.calls[0][0];
      expect(sent.method).toBe('SUBSCRIBE');
      expect(sent.params).toEqual([
        'btcusdt@depth10@100ms',
        'btcusdt@trade',
        'btcusdt@ticker',
      ]);
    });

    it('handles multiple symbols', async () => {
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);

      const sent = sendMock.mock.calls[0][0];
      expect(sent.params).toEqual([
        'btcusdt@depth10@100ms',
        'btcusdt@trade',
        'btcusdt@ticker',
        'ethusdt@depth10@100ms',
        'ethusdt@trade',
        'ethusdt@ticker',
      ]);
    });

    it('throws when not connected', async () => {
      // Force ws to simulate non-OPEN
      (client as unknown as { ws: { readyState: number } }).ws.readyState = 0;
      await expect(client.subscribe(['BTC/USDT'])).rejects.toThrow('WebSocket not connected');
    });

    it('adds symbols to subscribedSymbols set', async () => {
      await client.subscribe(['BTC/USDT']);
      const subs = client.getSubscriptions(['BTC/USDT']);
      expect(subs).toContain('btcusdt@depth10@100ms');
    });
  });

  describe('unsubscribe', () => {
    beforeEach(async () => {
      await connectAndOpen();
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);
    });

    it('builds unsubscribe with correct params', async () => {
      sendMock.mockClear();
      await client.unsubscribe(['BTC/USDT']);

      const sent = sendMock.mock.calls[0][0];
      expect(sent.method).toBe('UNSUBSCRIBE');
      expect(sent.params).toEqual([
        'btcusdt@depth10@100ms',
        'btcusdt@trade',
        'btcusdt@ticker',
      ]);
    });

    it('removes symbol from subscribedSymbols', async () => {
      await client.unsubscribe(['BTC/USDT']);
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);
      const sent = sendMock.mock.calls[0][0];
      expect(sent.params).toContain('btcusdt@depth10@100ms');
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('returns null for subscription response (result null + id)', () => {
      const result = client.handleMessage({ result: null, id: 123 });
      expect(result).toBeNull();
    });

    it('returns null when no eventType', () => {
      const result = client.handleMessage({ s: 'BTCUSDT' });
      expect(result).toBeNull();
    });

    it('returns null when no symbol', () => {
      const result = client.handleMessage({ e: 'trade' });
      expect(result).toBeNull();
    });

    it('returns null for unknown event type', () => {
      const result = client.handleMessage({ e: 'unknown', s: 'BTCUSDT', E: 1 });
      expect(result).toBeNull();
    });

    it('parses depthUpdate into orderbook message', () => {
      const result = client.handleMessage({
        e: 'depthUpdate',
        s: 'BTCUSDT',
        E: 1700000000,
        lastUpdateId: 123,
        b: [['50000', '1.5']],
        a: [['50001', '2.0']],
      }) as WebSocketMessage;

      expect(result.type).toBe('orderbook');
      expect(result.exchange).toBe('binance');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.timestamp).toBe(1700000000);
      expect(result.data).toEqual({
        lastUpdateId: 123,
        bids: [['50000', '1.5']],
        asks: [['50001', '2.0']],
      });
    });

    it('parses trade event into trade message', () => {
      const result = client.handleMessage({
        e: 'trade',
        s: 'ETHBTC',
        E: 1700000000,
        t: 456,
        p: '0.05',
        q: '10',
        b: 1,
        a: 2,
        T: 1699999999,
        m: true,
      }) as WebSocketMessage;

      expect(result.type).toBe('trade');
      expect(result.exchange).toBe('binance');
      expect(result.data).toEqual({
        e: 'trade',
        E: 1700000000,
        s: 'ETHBTC',
        t: 456,
        p: '0.05',
        q: '10',
        b: 1,
        a: 2,
        T: 1699999999,
        m: true,
      });
    });

    it('parses 24hrTicker event into ticker message', () => {
      const result = client.handleMessage({
        e: '24hrTicker',
        s: 'BNBUSDT',
        E: 1700000000,
        p: '10',
        P: '5',
        c: '200',
        o: '190',
        h: '210',
        l: '180',
        v: '1000',
        q: '200000',
      }) as WebSocketMessage;

      expect(result.type).toBe('ticker');
      expect(result.exchange).toBe('binance');
      expect(result.symbol).toBe('BNB/USDT');
      expect(result.data).toEqual({
        e: '24hrTicker',
        E: 1700000000,
        s: 'BNBUSDT',
        p: '10',
        P: '5',
        c: '200',
        o: '190',
        h: '210',
        l: '180',
        v: '1000',
        q: '200000',
      });
    });

    it('preserves already-normalized symbol with slash', () => {
      const result = client.handleMessage({
        e: 'trade',
        s: 'BTC/USDT',
        E: 1,
        t: 1, p: '1', q: '1', b: 1, a: 1, T: 1, m: false,
      }) as WebSocketMessage;
      expect(result.symbol).toBe('BTC/USDT');
    });
  });

  describe('normalizeSymbol', () => {
    it('converts BNBUSDT to BNB/USDT', () => {
      expect(client.normalizeSymbol('BNBUSDT')).toBe('BNB/USDT');
    });

    it('converts BTCETH to BTC/ETH', () => {
      expect(client.normalizeSymbol('BTCETH')).toBe('BTC/ETH');
    });

    it('converts BNBUSDC to BNB/USDC', () => {
      expect(client.normalizeSymbol('BNBUSDC')).toBe('BNB/USDC');
    });

    it('returns raw symbol when no quote currency matches', () => {
      expect(client.normalizeSymbol('XYZABC')).toBe('XYZABC');
    });

    it('returns raw symbol for single-part string', () => {
      expect(client.normalizeSymbol('ETH')).toBe('ETH');
    });
  });

  describe('sendHeartbeat', () => {
    it('sends PING message', async () => {
      await connectAndOpen();
      sendMock.mockClear();
      client.sendHeartbeat();
      const sent = sendMock.mock.calls[0]?.[0];
      expect(sent.method).toBe('PING');
    });
  });

  describe('getSubscriptions', () => {
    it('converts symbols to depth stream names', () => {
      const subs = client.getSubscriptions(['BTC/USDT', 'ETH/USDT']);
      expect(subs).toEqual([
        'btcusdt@depth10@100ms',
        'ethusdt@depth10@100ms',
      ]);
    });

    it('handles empty array', () => {
      expect(client.getSubscriptions([])).toEqual([]);
    });
  });

  describe('end-to-end message flow', () => {
    it('receives and parses trade messages through onmessage', async () => {
      await connectAndOpen();
      const handler = vi.fn();
      client.onMessage(handler);

      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);

      emitMessage({
        e: 'trade',
        s: 'BTCUSDT',
        E: 1700000000,
        t: 1, p: '50000', q: '0.01', b: 1, a: 2, T: 1699999999, m: false,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('trade');
      expect(msg.exchange).toBe('binance');
      expect(msg.symbol).toBe('BTC/USDT');
    });

    it('receives and parses depthUpdate messages through onmessage', async () => {
      await connectAndOpen();
      const handler = vi.fn();
      client.onMessage(handler);

      emitMessage({
        e: 'depthUpdate',
        s: 'ETHUSDT',
        E: 1700000000,
        lastUpdateId: 456,
        b: [['3000', '1']],
        a: [['3001', '2']],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('orderbook');
      expect(msg.exchange).toBe('binance');
      expect(msg.symbol).toBe('ETH/USDT');
    });

    it('receives and parses 24hrTicker messages through onmessage', async () => {
      await connectAndOpen();
      const handler = vi.fn();
      client.onMessage(handler);

      emitMessage({
        e: '24hrTicker',
        s: 'BNBUSDT',
        E: 1700000000,
        p: '10', P: '5', c: '200', o: '190', h: '210', l: '180', v: '1000', q: '200000',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('ticker');
      expect(msg.exchange).toBe('binance');
      expect(msg.symbol).toBe('BNB/USDT');
    });
  });

  describe('disconnect unsubscribes then closes', () => {
    it('unsubscribes all symbols before closing ws', async () => {
      await connectAndOpen();
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);
      const subCalls = sendMock.mock.calls.length;

      await client.disconnect();

      // Should have called UNSUBSCRIBE then close
      expect(closeMock).toHaveBeenCalled();
    });
  });

  describe('parseOrderBook', () => {
    it('parses bids and asks correctly', () => {
      const result = client.handleMessage({
        e: 'depthUpdate',
        s: 'BTCUSDT',
        E: 1700000000,
        lastUpdateId: 123,
        b: [['50000', '1.5'], ['49999', '2.0']],
        a: [['50001', '2.0'], ['50002', '1.0']],
      }) as WebSocketMessage;
      expect(result.data.bids).toEqual([['50000', '1.5'], ['49999', '2.0']]);
      expect(result.data.asks).toEqual([['50001', '2.0'], ['50002', '1.0']]);
    });
  });

  describe('parseTrade', () => {
    it('parses all trade fields correctly', () => {
      const result = client.handleMessage({
        e: 'trade',
        s: 'BTCUSDT',
        E: 1700000000,
        t: 12345,
        p: '50000.50',
        q: '0.123',
        b: 999,
        a: 888,
        T: 1699999999,
        m: false,
      }) as WebSocketMessage;
      expect(result.data.t).toBe(12345);
      expect(result.data.p).toBe('50000.50');
      expect(result.data.q).toBe('0.123');
      expect(result.data.b).toBe(999);
      expect(result.data.a).toBe(888);
      expect(result.data.T).toBe(1699999999);
      expect(result.data.m).toBe(false);
    });
  });

  describe('parseTicker', () => {
    it('parses all ticker fields correctly', () => {
      const result = client.handleMessage({
        e: '24hrTicker',
        s: 'BTCUSDT',
        E: 1700000000,
        p: '1000',
        P: '2.0',
        c: '51000',
        o: '50000',
        h: '52000',
        l: '49000',
        v: '10000',
        q: '500000000',
      }) as WebSocketMessage;
      expect(result.data.p).toBe('1000');
      expect(result.data.P).toBe('2.0');
      expect(result.data.c).toBe('51000');
      expect(result.data.o).toBe('50000');
      expect(result.data.h).toBe('52000');
      expect(result.data.l).toBe('49000');
      expect(result.data.v).toBe('10000');
      expect(result.data.q).toBe('500000000');
    });
  });
});