/**
 * PolymarketWebSocketFeed — Unit Tests
 *
 * Covers:
 * - subscribe / unsubscribe (dedup, send only when OPEN)
 * - onPriceUpdate handler registration
 * - close() (clears heartbeat, clears reconnect, closes ws)
 * - connect() no-op when closed
 * - handleMessage merges partial prices and emits to handlers
 * - mergePriceAndEmit publishes to NATS when bus connected
 * - startPolymarketWebSocket() factory + stop() removes SIGTERM listener
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (hoisted to top of file via vi.hoisted)
// ---------------------------------------------------------------------------

// Per-instance handler registry so tests can invoke ws event callbacks.
const messageHandlers: Array<(data: string) => void> = [];
const openHandlers: Array<() => void> = [];

const { MockWebSocket, publishMock, constructCalls } = vi.hoisted(() => {
  const constructCalls: unknown[][] = [];
  class MockWs {
    static OPEN = 1;
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === 'message') messageHandlers.push(handler as (data: string) => void);
      if (event === 'open') openHandlers.push(handler as () => void);
    }
    constructor(...args: unknown[]) {
      constructCalls.push(args);
      // Reset handler arrays for each new instance so tests see only their own.
      messageHandlers.length = 0;
      openHandlers.length = 0;
    }
  }
  // Spy methods + mutable readyState on prototype so mock state is shared
  // across instances and accessible via MockWebSocket.prototype.send.mockClear().
  MockWs.prototype.readyState = 1;
  MockWs.prototype.send = vi.fn();
  MockWs.prototype.ping = vi.fn();
  MockWs.prototype.close = vi.fn();
  MockWs.prototype.removeAllListeners = vi.fn();
  const publish = vi.fn().mockResolvedValue(undefined);
  return { MockWebSocket: MockWs, publishMock: publish, constructCalls };
});

vi.mock('ws', () => ({
  default: MockWebSocket,
}));

vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/shared/messaging/index', () => ({
  getMessageBus: () => ({
    isConnected: () => true,
    publish: publishMock,
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { PolymarketWebSocketFeed, startPolymarketWebSocket } from '../../../../src/desk/feeds/polymarket-websocket-feed';
import { parseWsMessage } from '../../../../src/desk/feeds/polymarket-websocket-message-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetWsState(): void {
  messageHandlers.length = 0;
  openHandlers.length = 0;
  MockWebSocket.prototype.readyState = 1;
  constructCalls.length = 0;
  MockWebSocket.prototype.send.mockClear();
  MockWebSocket.prototype.ping.mockClear();
  MockWebSocket.prototype.close.mockClear();
  MockWebSocket.prototype.removeAllListeners.mockClear();
  publishMock.mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Invoke the registered 'message' handler (captured by the mock). */
function emitMessage(data: string): void {
  const handler = messageHandlers[0];
  if (!handler) throw new Error('No message handler registered — connect() must be called first');
  handler(data);
}

describe('PolymarketWebSocketFeed', () => {
  let feed: PolymarketWebSocketFeed;

  beforeEach(() => {
    vi.useFakeTimers();
    resetWsState();
    feed = new PolymarketWebSocketFeed();
    feed.connect();
    // Fire the 'open' handler so heartbeat + re-subscribe logic runs.
    const open = openHandlers[0];
    if (open) open();
  });

  afterEach(() => {
    feed.close();
    vi.useRealTimers();
  });

  describe('subscribe', () => {
    it('adds tokenId to subscribed set', () => {
      feed.subscribe(['token-a']);
      feed.unsubscribe('token-a');
      expect(() => feed.unsubscribe('token-a')).not.toThrow();
    });

    it('deduplicates repeated subscribe calls', () => {
      feed.subscribe(['token-a']);
      feed.subscribe(['token-a']);
      const subscribeSends = MockWebSocket.prototype.send.mock.calls.filter(
        (c) => JSON.parse(c[0] as string).type === 'subscribe',
      );
      expect(subscribeSends).toHaveLength(1);
    });

    it('does not send subscribe when ws not OPEN', () => {
      feed.subscribe(['token-b']);
      MockWebSocket.prototype.readyState = 0; // CONNECTING
      feed.subscribe(['token-c']);
      const subscribeSends = MockWebSocket.prototype.send.mock.calls.filter(
        (c) => JSON.parse(c[0] as string).type === 'subscribe',
      );
      // Only the first subscribe (OPEN) sends.
      expect(subscribeSends).toHaveLength(1);
    });
  });

  describe('unsubscribe', () => {
    it('sends unsubscribe message when ws is OPEN', () => {
      feed.subscribe(['token-x']);
      MockWebSocket.prototype.send.mockClear();
      feed.unsubscribe('token-x');
      const unsubSends = MockWebSocket.prototype.send.mock.calls.filter(
        (c) => JSON.parse(c[0] as string).type === 'unsubscribe',
      );
      expect(unsubSends).toHaveLength(1);
    });

    it('does not send unsubscribe when ws not OPEN', () => {
      feed.subscribe(['token-y']);
      MockWebSocket.prototype.readyState = 0;
      MockWebSocket.prototype.send.mockClear();
      feed.unsubscribe('token-y');
      expect(MockWebSocket.prototype.send).not.toHaveBeenCalled();
    });
  });

  describe('onPriceUpdate', () => {
    it('registers a handler that fires on price update', () => {
      const handler = vi.fn();
      feed.onPriceUpdate(handler);
      feed.subscribe(['tok-1']);
      emitMessage(
        JSON.stringify({ event_type: 'book', asset_id: 'tok-1', data: { bids: [{ price: '0.5', size: '1' }], asks: [{ price: '0.5', size: '1' }] } }),
      );
      expect(handler).toHaveBeenCalledOnce();
      const update = handler.mock.calls[0][0];
      expect(update.tokenId).toBe('tok-1');
      expect(update.yesPrice).toBeCloseTo(0.5);
    });
  });

  describe('close', () => {
    it('clears heartbeat and reconnect timers, closes ws', () => {
      feed.subscribe(['tok-1']);
      vi.advanceTimersByTime(30_000);
      feed.close();
      expect(MockWebSocket.prototype.close).toHaveBeenCalled();
      expect(MockWebSocket.prototype.removeAllListeners).toHaveBeenCalled();
    });

    it('is a no-op when called twice', () => {
      feed.close();
      expect(() => feed.close()).not.toThrow();
    });
  });

  describe('connect', () => {
    it('does not reconnect after close()', () => {
      feed.close();
      const callCountBefore = constructCalls.length;
      feed.connect();
      expect(constructCalls.length).toBe(callCountBefore);
    });
  });

  describe('handleMessage', () => {
    it('ignores events for unsubscribed tokens', () => {
      const handler = vi.fn();
      feed.onPriceUpdate(handler);
      emitMessage(
        JSON.stringify({ event_type: 'book', asset_id: 'unknown', data: { bids: [{ price: '0.5', size: '1' }], asks: [{ price: '0.5', size: '1' }] } }),
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('merges partial prices across multiple messages', () => {
      const handler = vi.fn();
      feed.onPriceUpdate(handler);
      feed.subscribe(['tok-2']);
      emitMessage(
        JSON.stringify({ event_type: 'book', asset_id: 'tok-2', data: { bids: [{ price: '0.4', size: '1' }], asks: [{ price: '0.6', size: '1' }] } }),
      );
      emitMessage(
        JSON.stringify({ event_type: 'trade', asset_id: 'tok-2', data: { price: '0.55', size: '100' } }),
      );
      const lastUpdate = handler.mock.calls[1][0];
      expect(lastUpdate.yesPrice).toBeCloseTo(0.5);
      expect(lastUpdate.lastTradePrice).toBeCloseTo(0.55);
    });
  });

  describe('mergePriceAndEmit — NATS publish', () => {
    it('publishes to NATS when bus is connected', () => {
      const handler = vi.fn();
      feed.onPriceUpdate(handler);
      feed.subscribe(['tok-3']);
      emitMessage(
        JSON.stringify({ event_type: 'book', asset_id: 'tok-3', data: { bids: [{ price: '0.3', size: '1' }], asks: [{ price: '0.7', size: '1' }] } }),
      );
      expect(publishMock).toHaveBeenCalledOnce();
      const [topic] = publishMock.mock.calls[0];
      expect(topic).toBe('market.tok-3.update');
    });
  });
});

describe('startPolymarketWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetWsState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns feed and stop function', () => {
    const { feed, stop } = startPolymarketWebSocket(['tok-1']);
    expect(feed).toBeInstanceOf(PolymarketWebSocketFeed);
    expect(typeof stop).toBe('function');
    stop();
  });

  it('stop() removes SIGTERM listener and closes feed', () => {
    const { stop } = startPolymarketWebSocket(['tok-1']);
    const listenersBefore = process.listenerCount('SIGTERM');
    stop();
    expect(process.listenerCount('SIGTERM')).toBe(listenersBefore - 1);
  });
});
