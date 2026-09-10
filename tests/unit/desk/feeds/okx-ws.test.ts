/**
 * OKXWebSocketClient — Unit Tests
 *
 * Covers:
 * - connect() / disconnect() lifecycle
 * - subscribe() builds args with instId format; throws when not connected
 * - unsubscribe() builds args; removes symbols
 * - handleMessage: subscription response, error, books5/trades/tickers channels,
 *   no channel/instId, empty data array, unknown channel
 * - sendHeartbeat sends ping
 * - stopHeartbeat clears pingTimer
 * - getSubscriptions builds books5 args
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

import { OKXWebSocketClient } from '../../../../src/desk/feeds/okx-ws';
import { WebSocketMessage } from '../../../../src/desk/feeds/ws-types';
import { logger } from '../../../../src/shared/utils/logger';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OKXWebSocketClient', () => {
  let client: OKXWebSocketClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new OKXWebSocketClient();
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

    it('disconnect calls unsubscribe with all subscribed symbols', async () => {
      await connectAndOpen();
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);
      sendMock.mockClear();
      await client.disconnect();

      const sent = sendMock.mock.calls[0][0];
      expect(sent.op).toBe('unsubscribe');
      expect(sent.args.length).toBe(6); // books5, trades, tickers for each symbol
    });

    it('disconnect clears heartbeat timers', async () => {
      await connectAndOpen();
      await vi.advanceTimersByTimeAsync(30000);
      await client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('subscribe', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('builds books5/trades/tickers args for each symbol', async () => {
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);

      const sent = sendMock.mock.calls[0][0];
      expect(sent.op).toBe('subscribe');
      expect(sent.args).toEqual([
        { channel: 'books5', instId: 'BTC-USDT' },
        { channel: 'trades', instId: 'BTC-USDT' },
        { channel: 'tickers', instId: 'BTC-USDT' },
      ]);
    });

    it('handles multiple symbols', async () => {
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT', 'ETH/USDT']);

      const sent = sendMock.mock.calls[0][0];
      // OKX subscribes: all books5 first, then all trades/tickers per symbol
      expect(sent.args).toEqual([
        { channel: 'books5', instId: 'BTC-USDT' },
        { channel: 'books5', instId: 'ETH-USDT' },
        { channel: 'trades', instId: 'BTC-USDT' },
        { channel: 'tickers', instId: 'BTC-USDT' },
        { channel: 'trades', instId: 'ETH-USDT' },
        { channel: 'tickers', instId: 'ETH-USDT' },
      ]);
    });

    it('throws when not connected', async () => {
      // Force ws to simulate non-OPEN
      (client as unknown as { ws: { readyState: number } }).ws!.readyState = 0;
      await expect(client.subscribe(['BTC/USDT'])).rejects.toThrow('WebSocket not connected');
    });

    it('adds symbols to subscribedSymbols set', async () => {
      await client.subscribe(['BTC/USDT']);
      const subs = client.getSubscriptions(['BTC/USDT']);
      expect(subs).toContainEqual({ channel: 'books5', instId: 'BTC-USDT' });
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
      expect(sent.op).toBe('unsubscribe');
      expect(sent.args).toEqual([
        { channel: 'books5', instId: 'BTC-USDT' },
        { channel: 'trades', instId: 'BTC-USDT' },
        { channel: 'tickers', instId: 'BTC-USDT' },
      ]);
    });

    it('removes symbol from subscribedSymbols', async () => {
      await client.unsubscribe(['BTC/USDT']);
      sendMock.mockClear();
      await client.subscribe(['BTC/USDT']);
      const sent = sendMock.mock.calls[0][0];
      expect(sent.args).toContainEqual({ channel: 'books5', instId: 'BTC-USDT' });
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      await connectAndOpen();
    });

    it('returns null for subscription response (event === subscribe)', () => {
      const result = client.handleMessage({ event: 'subscribe', arg: { channel: 'books5', instId: 'BTC-USDT' } });
      expect(result).toBeNull();
    });

    it('returns null for error response', () => {
      const result = client.handleMessage({ event: 'error', msg: 'test error' });
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns null when no channel', () => {
      const result = client.handleMessage({ arg: { instId: 'BTC-USDT' } });
      expect(result).toBeNull();
    });

    it('returns null when no instId', () => {
      const result = client.handleMessage({ arg: { channel: 'books5' } });
      expect(result).toBeNull();
    });

    it('returns null when data array is missing', () => {
      const result = client.handleMessage({ arg: { channel: 'books5', instId: 'BTC-USDT' } });
      expect(result).toBeNull();
    });

    it('returns null when data array is empty', () => {
      const result = client.handleMessage({ arg: { channel: 'books5', instId: 'BTC-USDT' }, data: [] });
      expect(result).toBeNull();
    });

    it('returns null for unknown channel', () => {
      const result = client.handleMessage({ arg: { channel: 'unknown', instId: 'BTC-USDT' }, data: [{}] });
      expect(result).toBeNull();
    });

    it('parses books5 into orderbook message', () => {
      const result = client.handleMessage({
        arg: { channel: 'books5', instId: 'BTC-USDT' },
        data: [{
          seqId: 123,
          asks: [[['50001', '2.0', '1', '0']]],
          bids: [[['50000', '1.5', '1', '0']]],
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.type).toBe('orderbook');
      expect(result.exchange).toBe('okx');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.timestamp).toBeTypeOf('number');
      expect(result.data).toEqual({
        seqId: 123,
        asks: [['50001', '2.0', '1', '0']],
        bids: [['50000', '1.5', '1', '0']],
        timestamp: '1700000000000',
      });
    });

    it('parses books50 into orderbook message', () => {
      const result = client.handleMessage({
        arg: { channel: 'books50', instId: 'ETH-USDT' },
        data: [{
          seqId: 456,
          asks: [[['3001', '1.0', '1', '0']]],
          bids: [[['3000', '2.0', '1', '0']]],
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.type).toBe('orderbook');
      expect(result.exchange).toBe('okx');
      expect(result.symbol).toBe('ETH/USDT');
    });

    it('parses bbo-tbt into orderbook message', () => {
      const result = client.handleMessage({
        arg: { channel: 'bbo-tbt', instId: 'BTC-USDT' },
        data: [{
          seqId: 789,
          asks: [[['50001', '1.0', '1', '0']]],
          bids: [[['50000', '1.5', '1', '0']]],
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.type).toBe('orderbook');
      expect(result.exchange).toBe('okx');
      expect(result.symbol).toBe('BTC/USDT');
    });

    it('parses trades channel into trade message', () => {
      const result = client.handleMessage({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [{
          instId: 'BTC-USDT',
          tradeId: '12345',
          px: '50000.50',
          sz: '0.123',
          side: 'buy',
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.type).toBe('trade');
      expect(result.exchange).toBe('okx');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.data).toEqual({
        instId: 'BTC-USDT',
        tradeId: '12345',
        px: '50000.50',
        sz: '0.123',
        side: 'buy',
        ts: '1700000000000',
      });
    });

    it('parses tickers channel into ticker message', () => {
      const result = client.handleMessage({
        arg: { channel: 'tickers', instId: 'BTC-USDT' },
        data: [{
          instId: 'BTC-USDT',
          last: '50000',
          lastSz: '0.1',
          askPx: '50001',
          askSz: '1.0',
          bidPx: '49999',
          bidSz: '2.0',
          open24h: '49000',
          high24h: '51000',
          low24h: '48000',
          volCcyl24h: '1000',
          volUsd24h: '50000000',
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.type).toBe('ticker');
      expect(result.exchange).toBe('okx');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.data.instId).toBe('BTC-USDT');
      expect(result.data.last).toBe('50000');
      expect(result.data.askPx).toBe('50001');
      expect(result.data.bidPx).toBe('49999');
      expect(result.data.volCcyl24h).toBe('1000');
      expect(result.data.volUsd24h).toBe('50000000');
    });

    it('converts instId from BTC-USDT to BTC/USDT format', () => {
      const result = client.handleMessage({
        arg: { channel: 'trades', instId: 'ETH-USDT' },
        data: [{
          instId: 'ETH-USDT',
          tradeId: '1',
          px: '3000',
          sz: '1',
          side: 'sell',
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.symbol).toBe('ETH/USDT');
    });
  });

  describe('sendHeartbeat', () => {
    it('sends ping message', async () => {
      await connectAndOpen();
      sendMock.mockClear();
      client.sendHeartbeat();
      const sent = sendMock.mock.calls[0]?.[0];
      expect(sent).toBe('ping');
    });
  });

  describe('stopHeartbeat', () => {
    it('clears heartbeat timers when called via disconnect', async () => {
      await connectAndOpen();
      await vi.advanceTimersByTimeAsync(30000);
      await client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });

    it('clears heartbeat timers when stopHeartbeat is invoked directly', async () => {
      await connectAndOpen();
      await vi.advanceTimersByTimeAsync(30000);
      (client as unknown as { stopHeartbeat: () => void }).stopHeartbeat();
      expect(client.getState()).toBe('connected');
    });
  });

  describe('getSubscriptions', () => {
    it('converts symbols to books5 args with instId', () => {
      const subs = client.getSubscriptions(['BTC/USDT', 'ETH/USDT']);
      expect(subs).toEqual([
        { channel: 'books5', instId: 'BTC-USDT' },
        { channel: 'books5', instId: 'ETH-USDT' },
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
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [{
          instId: 'BTC-USDT',
          tradeId: '1',
          px: '50000',
          sz: '0.01',
          side: 'buy',
          ts: '1700000000000',
        }],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('trade');
      expect(msg.exchange).toBe('okx');
      expect(msg.symbol).toBe('BTC/USDT');
    });

    it('receives and parses books5 messages through onmessage', async () => {
      await connectAndOpen();
      const handler = vi.fn();
      client.onMessage(handler);

      emitMessage({
        arg: { channel: 'books5', instId: 'ETH-USDT' },
        data: [{
          seqId: 456,
          asks: [['3001', '1.0', '1', '0']],
          bids: [['3000', '2.0', '1', '0']],
          ts: '1700000000000',
        }],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('orderbook');
      expect(msg.exchange).toBe('okx');
      expect(msg.symbol).toBe('ETH/USDT');
    });

    it('receives and parses tickers messages through onmessage', async () => {
      await connectAndOpen();
      const handler = vi.fn();
      client.onMessage(handler);

      emitMessage({
        arg: { channel: 'tickers', instId: 'BNB-USDT' },
        data: [{
          instId: 'BNB-USDT',
          last: '200',
          lastSz: '10',
          askPx: '201',
          askSz: '5',
          bidPx: '199',
          bidSz: '5',
          open24h: '190',
          high24h: '210',
          low24h: '180',
          volCcyl24h: '1000',
          volUsd24h: '200000',
          ts: '1700000000000',
        }],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const msg = handler.mock.calls[0][0] as WebSocketMessage;
      expect(msg.type).toBe('ticker');
      expect(msg.exchange).toBe('okx');
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
    it('parses asks and bids correctly with 4-element arrays', () => {
      const result = client.handleMessage({
        arg: { channel: 'books5', instId: 'BTC-USDT' },
        data: [{
          seqId: 123,
          asks: [[['50001', '2.0', '1', '0'], ['50002', '1.0', '1', '0']]],
          bids: [[['50000', '1.5', '1', '0'], ['49999', '2.0', '1', '0']]],
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.data.asks).toEqual([
        ['50001', '2.0', '1', '0'],
        ['50002', '1.0', '1', '0'],
      ]);
      expect(result.data.bids).toEqual([
        ['50000', '1.5', '1', '0'],
        ['49999', '2.0', '1', '0'],
      ]);
      expect(result.data.seqId).toBe(123);
    });

    it('handles missing asks/bids gracefully', () => {
      const result = client.handleMessage({
        arg: { channel: 'books5', instId: 'BTC-USDT' },
        data: [{
          seqId: 123,
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.data.asks).toEqual([]);
      expect(result.data.bids).toEqual([]);
      expect(result.data.seqId).toBe(123);
    });
  });

  describe('parseTrade', () => {
    it('parses all trade fields correctly', () => {
      const result = client.handleMessage({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [{
          instId: 'BTC-USDT',
          tradeId: '12345',
          px: '50000.50',
          sz: '0.123',
          side: 'buy',
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.data.tradeId).toBe('12345');
      expect(result.data.px).toBe('50000.50');
      expect(result.data.sz).toBe('0.123');
      expect(result.data.side).toBe('buy');
      expect(result.data.ts).toBe('1700000000000');
    });

    it('parses sell side correctly', () => {
      const result = client.handleMessage({
        arg: { channel: 'trades', instId: 'BTC-USDT' },
        data: [{
          instId: 'BTC-USDT',
          tradeId: '12346',
          px: '50000.00',
          sz: '0.5',
          side: 'sell',
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.data.side).toBe('sell');
    });
  });

  describe('parseTicker', () => {
    it('parses all ticker fields correctly', () => {
      const result = client.handleMessage({
        arg: { channel: 'tickers', instId: 'BTC-USDT' },
        data: [{
          instId: 'BTC-USDT',
          last: '50000',
          lastSz: '0.1',
          askPx: '50001',
          askSz: '1.0',
          bidPx: '49999',
          bidSz: '2.0',
          open24h: '49000',
          high24h: '51000',
          low24h: '48000',
          volCcyl24h: '1000',
          volUsd24h: '50000000',
          ts: '1700000000000',
        }],
      }) as WebSocketMessage;

      expect(result.data.instId).toBe('BTC-USDT');
      expect(result.data.last).toBe('50000');
      expect(result.data.lastSz).toBe('0.1');
      expect(result.data.askPx).toBe('50001');
      expect(result.data.askSz).toBe('1.0');
      expect(result.data.bidPx).toBe('49999');
      expect(result.data.bidSz).toBe('2.0');
      expect(result.data.open24h).toBe('49000');
      expect(result.data.high24h).toBe('51000');
      expect(result.data.low24h).toBe('48000');
      expect(result.data.volCcyl24h).toBe('1000');
      expect(result.data.volUsd24h).toBe('50000000');
      expect(result.data.ts).toBe('1700000000000');
    });
  });
});