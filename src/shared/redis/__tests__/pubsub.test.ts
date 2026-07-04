/**
 * PubSubManager Tests
 *
 * Covers: constructor, subscribeToSnapshot, unsubscribeFromSnapshot,
 * subscribeToAlerts, unsubscribeFromAlerts, publishSnapshot,
 * publishAlert, close, and message routing with mocked Redis clients.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables — must be declared before vi.mock() calls
// ---------------------------------------------------------------------------

/** Shared reference to the 'message' callback installed by setupSubscribers */
const callbacks = vi.hoisted(() => ({
  messageHandler: null as ((channel: string, message: string) => void) | null,
}));

const mockSubClient = vi.hoisted(() => ({
  on: vi.fn((event: string, handler: (channel: string, message: string) => void) => {
    if (event === 'message') {
      callbacks.messageHandler = handler;
    }
  }),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  quit: vi.fn().mockResolvedValue(undefined),
}));

const mockPubClient = vi.hoisted(() => ({
  publish: vi.fn().mockResolvedValue(1),
  quit: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mock
// ---------------------------------------------------------------------------

vi.mock('../index', () => ({
  getRedisClient: vi.fn(),
  getPubClient: vi.fn(() => mockPubClient),
  getSubClient: vi.fn(() => mockSubClient),
}));

// ---------------------------------------------------------------------------
// SUT
// ---------------------------------------------------------------------------

import { PubSubManager, type OrderbookSnapshot } from '../pubsub';

describe('PubSubManager', () => {
  let manager: PubSubManager;

  beforeEach(() => {
    vi.clearAllMocks();
    callbacks.messageHandler = null;
    manager = new PubSubManager();
  });

  // ---------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------

  describe('constructor', () => {
    it('creates an instance and gets pub/sub clients', () => {
      expect(manager).toBeInstanceOf(PubSubManager);
    });

    it('sets up the message handler on the sub client', () => {
      expect(mockSubClient.on).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
    });
  });

  // ---------------------------------------------------------------
  // subscribeToSnapshot
  // ---------------------------------------------------------------

  describe('subscribeToSnapshot', () => {
    it('registers a handler and subscribes to the channel', () => {
      const handler = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);

      expect(mockSubClient.subscribe).toHaveBeenCalledWith(
        'orderbook:binance:BTC/USDT:snapshot',
      );
    });

    it('does not subscribe again for a second handler on the same channel', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler1);
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler2);

      // subscribe should only have been called once
      expect(mockSubClient.subscribe).toHaveBeenCalledTimes(1);
    });

    it('subscribes separately for different channels', () => {
      manager.subscribeToSnapshot('binance', 'BTC/USDT', vi.fn());
      manager.subscribeToSnapshot('kraken', 'ETH/USDT', vi.fn());

      expect(mockSubClient.subscribe).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------
  // unsubscribeFromSnapshot
  // ---------------------------------------------------------------

  describe('unsubscribeFromSnapshot', () => {
    it('removes a handler without unsubscribing if other handlers remain', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler1);
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler2);

      manager.unsubscribeFromSnapshot('binance', 'BTC/USDT', handler1);

      // unsubscribe should not have been called — handler2 still present
      expect(mockSubClient.unsubscribe).not.toHaveBeenCalled();
    });

    it('unsubscribes from the channel when the last handler is removed', () => {
      const handler = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);

      manager.unsubscribeFromSnapshot('binance', 'BTC/USDT', handler);

      expect(mockSubClient.unsubscribe).toHaveBeenCalledWith(
        'orderbook:binance:BTC/USDT:snapshot',
      );
    });

    it('does nothing for a non-existent channel', () => {
      const handler = vi.fn();

      // Should not throw
      expect(() =>
        manager.unsubscribeFromSnapshot('binance', 'NONEXISTENT', handler),
      ).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // subscribeToAlerts
  // ---------------------------------------------------------------

  describe('subscribeToAlerts', () => {
    it('registers an alert handler and subscribes to the alert channel', () => {
      manager.subscribeToAlerts(vi.fn());

      expect(mockSubClient.subscribe).toHaveBeenCalledWith(
        'orderbook:global:alert',
      );
    });
  });

  // ---------------------------------------------------------------
  // unsubscribeFromAlerts
  // ---------------------------------------------------------------

  describe('unsubscribeFromAlerts', () => {
    it('removes an alert handler', () => {
      const handler = vi.fn();
      manager.subscribeToAlerts(handler);

      manager.unsubscribeFromAlerts(handler);
      // No assertion on unsubscription since other handlers might still exist
    });

    it('unsubscribes from alert channel when the last handler is removed', () => {
      const handler = vi.fn();
      manager.subscribeToAlerts(handler);

      manager.unsubscribeFromAlerts(handler);

      expect(mockSubClient.unsubscribe).toHaveBeenCalledWith(
        'orderbook:global:alert',
      );
    });

    it('does nothing for a handler that was never registered', () => {
      expect(() => manager.unsubscribeFromAlerts(vi.fn())).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // publishSnapshot
  // ---------------------------------------------------------------

  describe('publishSnapshot', () => {
    const snapshot: OrderbookSnapshot = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      bids: [
        { price: 50000, amount: 1.5 },
        { price: 49990, amount: 2.0 },
      ],
      asks: [{ price: 50010, amount: 1.0 }],
      timestamp: 1700000000000,
      latency: 5,
    };

    it('publishes JSON to the correct snapshot channel', async () => {
      await manager.publishSnapshot(snapshot);

      expect(mockPubClient.publish).toHaveBeenCalledWith(
        'orderbook:binance:BTC/USDT:snapshot',
        JSON.stringify(snapshot),
      );
    });

    it('resolves when publish succeeds', async () => {
      await expect(manager.publishSnapshot(snapshot)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // publishAlert
  // ---------------------------------------------------------------

  describe('publishAlert', () => {
    it('publishes JSON with type and data to the alert channel', async () => {
      await manager.publishAlert('price_spike', { symbol: 'BTC/USDT', change: 0.05 });

      expect(mockPubClient.publish).toHaveBeenCalledWith(
        'orderbook:global:alert',
        JSON.stringify({ type: 'price_spike', data: { symbol: 'BTC/USDT', change: 0.05 } }),
      );
    });

    it('resolves when publish succeeds', async () => {
      await expect(manager.publishAlert('test', null)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // close
  // ---------------------------------------------------------------

  describe('close', () => {
    it('quits both sub and pub clients', async () => {
      await manager.close();

      expect(mockSubClient.quit).toHaveBeenCalledTimes(1);
      expect(mockPubClient.quit).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // Message routing (via captured message handler)
  // ---------------------------------------------------------------

  describe('message routing', () => {
    it('calls registered snapshot handlers when a snapshot message arrives', () => {
      const handler = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);

      const snapshot: OrderbookSnapshot = {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [],
        asks: [],
        timestamp: 1000,
        latency: 1,
      };

      expect(callbacks.messageHandler).not.toBeNull();
      callbacks.messageHandler!(
        'orderbook:binance:BTC/USDT:snapshot',
        JSON.stringify(snapshot),
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(snapshot);
    });

    it('calls all registered snapshot handlers for a channel', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler1);
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler2);

      const snapshot: OrderbookSnapshot = {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [],
        asks: [],
        timestamp: 1000,
        latency: 1,
      };

      callbacks.messageHandler!(
        'orderbook:binance:BTC/USDT:snapshot',
        JSON.stringify(snapshot),
      );

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('calls registered alert handlers when an alert message arrives', () => {
      const handler = vi.fn();
      manager.subscribeToAlerts(handler);

      const alertPayload = { type: 'price_spike', data: { symbol: 'BTC/USDT' } };

      callbacks.messageHandler!(
        'orderbook:global:alert',
        JSON.stringify(alertPayload),
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(alertPayload);
    });

    it('does not call snapshot handlers for alert messages', () => {
      const snapshotHandler = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', snapshotHandler);

      callbacks.messageHandler!(
        'orderbook:global:alert',
        JSON.stringify({ type: 'test' }),
      );

      expect(snapshotHandler).not.toHaveBeenCalled();
    });

    it('does not call alert handlers for snapshot messages', () => {
      const alertHandler = vi.fn();
      manager.subscribeToAlerts(alertHandler);

      const snapshot: OrderbookSnapshot = {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [],
        asks: [],
        timestamp: 1000,
        latency: 1,
      };

      callbacks.messageHandler!(
        'orderbook:binance:BTC/USDT:snapshot',
        JSON.stringify(snapshot),
      );

      expect(alertHandler).not.toHaveBeenCalled();
    });

    it('handles snapshot messages on channels not in the handler map', () => {
      // Handler exists for BTC/USDT but a message arrives for ETH/USDT
      const handler = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);

      const snapshot: OrderbookSnapshot = {
        exchange: 'binance',
        symbol: 'ETH/USDT',
        bids: [],
        asks: [],
        timestamp: 1000,
        latency: 1,
      };

      callbacks.messageHandler!(
        'orderbook:binance:ETH/USDT:snapshot',
        JSON.stringify(snapshot),
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not call snapshot handlers for a channel after they are unsubscribed', () => {
      const handler = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);
      manager.unsubscribeFromSnapshot('binance', 'BTC/USDT', handler);

      callbacks.messageHandler!(
        'orderbook:binance:BTC/USDT:snapshot',
        JSON.stringify({}),
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not call alert handlers after they are unsubscribed', () => {
      const handler = vi.fn();
      manager.subscribeToAlerts(handler);
      manager.unsubscribeFromAlerts(handler);

      callbacks.messageHandler!(
        'orderbook:global:alert',
        JSON.stringify({ type: 'test' }),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
