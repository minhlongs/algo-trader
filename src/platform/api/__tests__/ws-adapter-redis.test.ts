import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisWSAdapter } from '../ws-adapter-redis';
import { getPubClient, getSubClient } from '../../../redis';
import WebSocket from 'ws';
import { Server as HttpServer } from 'http';

// Mock Redis functions
vi.mock('../../../redis', () => {
  const mockPub = {
    publish: vi.fn(),
  };
  const mockSub = {
    subscribe: vi.fn(),
    on: vi.fn(),
    unsubscribe: vi.fn(),
  };
  return {
    getRedisClusterClient: vi.fn(),
    getPubClient: vi.fn(() => mockPub),
    getSubClient: vi.fn(() => mockSub),
    isClusterMode: vi.fn(() => false),
  };
});

// Mock ws library
vi.mock('ws', () => {
  class MockWebSocketServer {
    on = vi.fn();
    close = vi.fn((cb) => cb && cb());
  }
  return {
    default: {
      Server: MockWebSocketServer,
      OPEN: 1,
    },
    WebSocketServer: MockWebSocketServer,
  };
});

describe('RedisWSAdapter', () => {
  let mockServer: HttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {} as HttpServer;
  });

  it('should initialize and assign pubClient and subClient globally', () => {
    const adapter = new RedisWSAdapter(mockServer);

    expect(getPubClient).toHaveBeenCalled();
    expect(getSubClient).toHaveBeenCalled();
    expect(adapter.getClientCount()).toBe(0);
  });

  it('should maintain channel subscribers map correctly', () => {
    const adapter = new RedisWSAdapter(mockServer);

    const wsMock = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      on: vi.fn(),
    } as unknown as WebSocket;

    // Simulate connection and message handling
    const client = {
      ws: wsMock,
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-1',
    };

    adapter['clients'].set('client-1', client);

    // 1. Subscribe to a valid channel
    adapter['handleClientMessage'](client, Buffer.from(JSON.stringify({
      type: 'subscribe',
      channel: 'trades'
    })));

    expect(client.channels.has('trades')).toBe(true);
    expect(adapter['channelSubscribers'].get('trades')?.has(client)).toBe(true);

    // 2. Broadcast message to 'trades'
    adapter['broadcastToChannel']('trades', JSON.stringify({ type: 'trade_update', price: 100 }));
    expect(wsMock.send).toHaveBeenCalledTimes(2); // One for subscription confirmation, one for broadcast

    // 3. Unsubscribe from the channel
    adapter['handleClientMessage'](client, Buffer.from(JSON.stringify({
      type: 'unsubscribe',
      channel: 'trades'
    })));

    expect(client.channels.has('trades')).toBe(false);
    expect(adapter['channelSubscribers'].get('trades')?.has(client)).toBeFalsy();

    // 4. Close cleanup
    // Add client back to subscription
    client.channels.add('trades');
    let subs = adapter['channelSubscribers'].get('trades');
    if (!subs) {
      subs = new Set();
      adapter['channelSubscribers'].set('trades', subs);
    }
    subs.add(client);

    // Simulate close trigger
    const wsOnCalls = (adapter['wsServer'].on as any).mock.calls;
    const connectionCallback = wsOnCalls.find((call: any) => call[0] === 'connection')?.[1];

    if (connectionCallback) {
      const mockWsForClose = {
        on: vi.fn(),
        send: vi.fn(),
      } as unknown as WebSocket;
      
      connectionCallback(mockWsForClose, {});
      
      const closeCall = (mockWsForClose.on as any).mock.calls.find((call: any) => call[0] === 'close');
      const closeCallback = closeCall?.[1];
      
      if (closeCallback) {
        closeCallback();
      }
    }
  });
});
