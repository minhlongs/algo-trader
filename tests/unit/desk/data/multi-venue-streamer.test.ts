import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MultiVenueMarketStreamer,
  type WebSocketLike,
  type UnifiedOrderBook,
  type UnifiedTrade,
} from '../../../../src/desk/data/multi-venue-market-streamer';

class MockWebSocket implements WebSocketLike {
  public readyState = 1;
  public sentMessages: string[] = [];
  public listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  emit(event: string, ...args: unknown[]): void {
    const list = this.listeners.get(event) ?? [];
    for (const fn of list) fn(...args);
  }
}

describe('MultiVenueMarketStreamer', () => {
  let sockets: Record<string, MockWebSocket> = {};

  const mockWsFactory = (url: string): WebSocketLike => {
    const ws = new MockWebSocket();
    if (url.includes('binance')) sockets.binance = ws;
    else if (url.includes('hyperliquid')) sockets.hyperliquid = ws;
    else if (url.includes('polymarket')) sockets.polymarket = ws;
    return ws;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = {};
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('starts and connects to all configured venues', async () => {
    const streamer = new MultiVenueMarketStreamer({ venues: ['binance', 'hyperliquid', 'polymarket'] }, mockWsFactory);
    await streamer.start();

    expect(sockets.binance).toBeDefined();
    expect(sockets.hyperliquid).toBeDefined();
    expect(sockets.polymarket).toBeDefined();

    sockets.binance.emit('open');
    expect(streamer.getVenueState('binance')?.connected).toBe(true);

    streamer.stop();
    expect(streamer.getVenueState('binance')?.connected).toBe(false);
  });

  it('sends venue-specific subscription payloads and resends on connect', async () => {
    const streamer = new MultiVenueMarketStreamer({ venues: ['binance', 'hyperliquid', 'polymarket'] }, mockWsFactory);
    streamer.subscribe('binance', 'BTCUSDT');
    streamer.subscribe('hyperliquid', 'ETH');
    streamer.subscribe('polymarket', '0x123abc');

    await streamer.start();
    sockets.binance.emit('open');
    sockets.hyperliquid.emit('open');
    sockets.polymarket.emit('open');

    expect(sockets.binance.sentMessages.some((m) => m.includes('btcusdt@depth@100ms'))).toBe(true);
    expect(sockets.hyperliquid.sentMessages.some((m) => m.includes('ETH'))).toBe(true);
    expect(sockets.polymarket.sentMessages.some((m) => m.includes('0x123abc'))).toBe(true);

    streamer.stop();
  });

  it('parses and emits normalized orderbook events for all venues', async () => {
    const streamer = new MultiVenueMarketStreamer({ venues: ['binance', 'hyperliquid', 'polymarket'] }, mockWsFactory);
    await streamer.start();
    sockets.binance.emit('open');
    sockets.hyperliquid.emit('open');
    sockets.polymarket.emit('open');

    const receivedBooks: UnifiedOrderBook[] = [];
    streamer.on('orderbook', (book: UnifiedOrderBook) => receivedBooks.push(book));

    // Binance message
    sockets.binance.emit('message', JSON.stringify({
      e: 'depthUpdate',
      s: 'BTCUSDT',
      E: 1700000000000,
      u: 12345,
      b: [['50000.0', '1.5']],
      a: [['50001.0', '2.0']],
    }));

    // Hyperliquid message
    sockets.hyperliquid.emit('message', JSON.stringify({
      channel: 'l2Book',
      data: {
        coin: 'ETH',
        time: 1700000001000,
        levels: [[{ px: '3000.0', sz: '10.0' }], [{ px: '3001.0', sz: '5.0' }]],
      },
    }));

    // Polymarket message
    sockets.polymarket.emit('message', JSON.stringify({
      event_type: 'book',
      asset_id: '0xpoly1',
      bids: [{ price: '0.65', size: '100' }],
      asks: [{ price: '0.67', size: '150' }],
    }));

    expect(receivedBooks.length).toBe(3);
    expect(receivedBooks[0]).toMatchObject({ venue: 'binance', symbol: 'BTCUSDT', bids: [{ price: 50000, amount: 1.5 }] });
    expect(receivedBooks[1]).toMatchObject({ venue: 'hyperliquid', symbol: 'ETH', bids: [{ price: 3000, amount: 10 }] });
    expect(receivedBooks[2]).toMatchObject({ venue: 'polymarket', symbol: '0xpoly1', bids: [{ price: 0.65, amount: 100 }] });

    streamer.stop();
  });

  it('parses and emits normalized trade events', async () => {
    const streamer = new MultiVenueMarketStreamer({ venues: ['binance', 'hyperliquid', 'polymarket'] }, mockWsFactory);
    await streamer.start();
    sockets.binance.emit('open');
    sockets.hyperliquid.emit('open');
    sockets.polymarket.emit('open');

    const trades: UnifiedTrade[] = [];
    streamer.on('trade', (t: UnifiedTrade) => trades.push(t));

    sockets.binance.emit('message', JSON.stringify({
      e: 'trade',
      s: 'BTCUSDT',
      t: 9999,
      p: '50100.5',
      q: '0.25',
      T: 1700000005000,
      m: false,
    }));

    sockets.hyperliquid.emit('message', JSON.stringify({
      channel: 'trades',
      data: [{ coin: 'SOL', side: 'B', px: '150.2', sz: '20', time: 1700000006000, hash: '0xhash1' }],
    }));

    expect(trades.length).toBe(2);
    expect(trades[0]).toMatchObject({ venue: 'binance', symbol: 'BTCUSDT', side: 'buy', price: 50100.5, amount: 0.25 });
    expect(trades[1]).toMatchObject({ venue: 'hyperliquid', symbol: 'SOL', side: 'buy', price: 150.2, amount: 20 });

    streamer.stop();
  });

  it('handles exponential backoff reconnection on disconnect', async () => {
    const streamer = new MultiVenueMarketStreamer({
      venues: ['binance'],
      reconnectBaseMs: 100,
      reconnectMaxMs: 1000,
      maxReconnectAttempts: 3,
    }, mockWsFactory);

    await streamer.start();
    sockets.binance.emit('open');
    expect(streamer.getVenueState('binance')?.connected).toBe(true);

    // Trigger close
    sockets.binance.emit('close');
    expect(streamer.getVenueState('binance')?.connected).toBe(false);
    expect(streamer.getVenueState('binance')?.reconnectAttempts).toBe(1);

    // Advance timer to trigger reconnect
    vi.advanceTimersByTime(100);
    expect(sockets.binance).toBeDefined();

    // Trigger max retries
    sockets.binance.emit('close');
    vi.advanceTimersByTime(200);
    sockets.binance.emit('close');
    vi.advanceTimersByTime(400);

    const failSpy = vi.fn();
    streamer.on('reconnect_failed', failSpy);
    sockets.binance.emit('close');

    expect(failSpy).toHaveBeenCalledWith('binance');
    streamer.stop();
  });
});
