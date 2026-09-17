/**
 * PubSubManager routing & dispatch tests.
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

import { PubSubManager } from '../pubsub';

describe('PubSubManager message routing', () => {
  let manager: PubSubManager;
  beforeEach(() => {
    vi.clearAllMocks();
    callbacks.messageHandler = null;
    manager = new PubSubManager();
  });

  it('calls registered snapshot handlers when a snapshot message arrives', () => {
    const handler = vi.fn();
    manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);
    const snap: Parameters<PubSubManager['subscribeToSnapshot']>[2] = {
      exchange: 'binance', symbol: 'BTC/USDT', bids: [], asks: [], timestamp: 1000, latency: 1,
    };
    expect(callbacks.messageHandler).not.toBeNull();
    callbacks.messageHandler!('orderbook:binance:BTC/USDT:snapshot', JSON.stringify(snap));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(snap);
  });

  it('calls all registered snapshot handlers for a channel', () => {
    const h1 = vi.fn(), h2 = vi.fn();
    manager.subscribeToSnapshot('binance', 'BTC/USDT', h1);
    manager.subscribeToSnapshot('binance', 'BTC/USDT', h2);
    callbacks.messageHandler!('orderbook:binance:BTC/USDT:snapshot', JSON.stringify({ exchange: 'binance', symbol: 'BTC/USDT', bids: [], asks: [], timestamp: 1000, latency: 1 }));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('calls registered alert handlers when an alert message arrives', () => {
    const handler = vi.fn();
    manager.subscribeToAlerts(handler);
    callbacks.messageHandler!('orderbook:global:alert', JSON.stringify({ type: 'price_spike', data: { symbol: 'BTC/USDT' } }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'price_spike', data: { symbol: 'BTC/USDT' } });
  });

  it('does not call snapshot handlers for alert messages', () => {
    const snapshotHandler = vi.fn();
    manager.subscribeToSnapshot('binance', 'BTC/USDT', snapshotHandler);
    callbacks.messageHandler!('orderbook:global:alert', JSON.stringify({ type: 'test' }));
    expect(snapshotHandler).not.toHaveBeenCalled();
  });

  it('does not call alert handlers for snapshot messages', () => {
    const alertHandler = vi.fn();
    manager.subscribeToAlerts(alertHandler);
    callbacks.messageHandler!('orderbook:binance:BTC/USDT:snapshot', JSON.stringify({ exchange: 'binance', symbol: 'BTC/USDT', bids: [], asks: [], timestamp: 1000, latency: 1 }));
    expect(alertHandler).not.toHaveBeenCalled();
  });

  it('handles snapshot messages on channels not in the handler map', () => {
    const handler = vi.fn();
    manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);
    callbacks.messageHandler!('orderbook:binance:ETH/USDT:snapshot', JSON.stringify({ exchange: 'binance', symbol: 'ETH/USDT', bids: [], asks: [], timestamp: 1000, latency: 1 }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call snapshot handlers after unsubscribe', () => {
    const handler = vi.fn();
    manager.subscribeToSnapshot('binance', 'BTC/USDT', handler);
    manager.unsubscribeFromSnapshot('binance', 'BTC/USDT', handler);
    callbacks.messageHandler!('orderbook:binance:BTC/USDT:snapshot', JSON.stringify({}));
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call alert handlers after unsubscribe', () => {
    const handler = vi.fn();
    manager.subscribeToAlerts(handler);
    manager.unsubscribeFromAlerts(handler);
    callbacks.messageHandler!('orderbook:global:alert', JSON.stringify({ type: 'test' }));
    expect(handler).not.toHaveBeenCalled();
  });
});
