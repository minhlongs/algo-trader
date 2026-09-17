/**
 * PubSubManager Tests
 * Covers constructor, snapshot/alert subscriptions, and publishing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callbacks = vi.hoisted(() => ({
  messageHandler: null as ((channel: string, message: string) => void) | null,
}));

const mockSubClient = vi.hoisted(() => ({
  on: vi.fn((event: string, handler: (channel: string, message: string) => void) => {
    if (event === 'message') callbacks.messageHandler = handler;
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

vi.mock('../index', () => ({
  getRedisClient: vi.fn(),
  getPubClient: vi.fn(() => mockPubClient),
  getSubClient: vi.fn(() => mockSubClient),
}));

import { PubSubManager, type OrderbookSnapshot } from '../pubsub';

describe('PubSubManager', () => {
  let manager: PubSubManager;
  beforeEach(() => {
    vi.clearAllMocks();
    callbacks.messageHandler = null;
    manager = new PubSubManager();
  });

  describe('constructor', () => {
    it('creates an instance and gets pub/sub clients', () => {
      expect(manager).toBeInstanceOf(PubSubManager);
    });
    it('sets up the message handler on the sub client', () => {
      expect(mockSubClient.on).toHaveBeenCalledWith('message', expect.any(Function));
    });
  });

  describe('subscribeToSnapshot', () => {
    it('registers a handler and subscribes to the channel', () => {
      manager.subscribeToSnapshot('binance', 'BTC/USDT', vi.fn());
      expect(mockSubClient.subscribe).toHaveBeenCalledWith('orderbook:binance:BTC/USDT:snapshot');
    });
    it('does not subscribe again for a second handler on the same channel', () => {
      manager.subscribeToSnapshot('binance', 'BTC/USDT', vi.fn());
      manager.subscribeToSnapshot('binance', 'BTC/USDT', vi.fn());
      expect(mockSubClient.subscribe).toHaveBeenCalledTimes(1);
    });
    it('subscribes separately for different channels', () => {
      manager.subscribeToSnapshot('binance', 'BTC/USDT', vi.fn());
      manager.subscribeToSnapshot('kraken', 'ETH/USDT', vi.fn());
      expect(mockSubClient.subscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('unsubscribeFromSnapshot', () => {
    it('removes a handler without unsubscribing if other handlers remain', () => {
      const h1 = vi.fn(), h2 = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', h1);
      manager.subscribeToSnapshot('binance', 'BTC/USDT', h2);
      manager.unsubscribeFromSnapshot('binance', 'BTC/USDT', h1);
      expect(mockSubClient.unsubscribe).not.toHaveBeenCalled();
    });
    it('unsubscribes from the channel when the last handler is removed', () => {
      const h = vi.fn();
      manager.subscribeToSnapshot('binance', 'BTC/USDT', h);
      manager.unsubscribeFromSnapshot('binance', 'BTC/USDT', h);
      expect(mockSubClient.unsubscribe).toHaveBeenCalledWith('orderbook:binance:BTC/USDT:snapshot');
    });
    it('does nothing for a non-existent channel', () => {
      expect(() => manager.unsubscribeFromSnapshot('binance', 'NONEXISTENT', vi.fn())).not.toThrow();
    });
  });

  describe('subscribeToAlerts', () => {
    it('registers an alert handler and subscribes to the alert channel', () => {
      manager.subscribeToAlerts(vi.fn());
      expect(mockSubClient.subscribe).toHaveBeenCalledWith('orderbook:global:alert');
    });
  });

  describe('unsubscribeFromAlerts', () => {
    it('removes an alert handler', () => {
      const h = vi.fn();
      manager.subscribeToAlerts(h);
      manager.unsubscribeFromAlerts(h);
    });
    it('unsubscribes from alert channel when the last handler is removed', () => {
      const h = vi.fn();
      manager.subscribeToAlerts(h);
      manager.unsubscribeFromAlerts(h);
      expect(mockSubClient.unsubscribe).toHaveBeenCalledWith('orderbook:global:alert');
    });
    it('does nothing for a handler that was never registered', () => {
      expect(() => manager.unsubscribeFromAlerts(vi.fn())).not.toThrow();
    });
  });

  describe('publishSnapshot', () => {
    const snapshot: OrderbookSnapshot = {
      exchange: 'binance', symbol: 'BTC/USDT',
      bids: [{ price: 50000, amount: 1.5 }, { price: 49990, amount: 2.0 }],
      asks: [{ price: 50010, amount: 1.0 }],
      timestamp: 1700000000000, latency: 5,
    };
    it('publishes JSON to the correct snapshot channel', async () => {
      await manager.publishSnapshot(snapshot);
      expect(mockPubClient.publish).toHaveBeenCalledWith('orderbook:binance:BTC/USDT:snapshot', JSON.stringify(snapshot));
    });
    it('resolves when publish succeeds', async () => {
      await expect(manager.publishSnapshot(snapshot)).resolves.toBeUndefined();
    });
  });

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

  describe('close', () => {
    it('quits both sub and pub clients', async () => {
      await manager.close();
      expect(mockSubClient.quit).toHaveBeenCalledTimes(1);
      expect(mockPubClient.quit).toHaveBeenCalledTimes(1);
    });
  });
});
