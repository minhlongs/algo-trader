import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisWSAdapter } from '../ws-adapter-redis';
import { handleClientMessage, startHeartbeat } from '../ws-adapter-redis-handlers';
import { getPubClient, getSubClient } from '../../../redis';
import WebSocket from 'ws';
import { Server as HttpServer } from 'http';
import type { WSClient } from '../ws-adapter-redis-types';

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
    close = vi.fn((cb: (() => void) | undefined) => cb?.());
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
});

describe('ws-adapter-redis-handlers', () => {
  it('should maintain channel subscribers map correctly', () => {
    const adapter = new RedisWSAdapter({} as HttpServer);

    const wsMock = {
      readyState: 1, // WebSocket.OPEN
      send: vi.fn(),
      on: vi.fn(),
    };

    // Access internal state via adapter for integration test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = adapter['clients'] as Map<string, WSClient>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = adapter['config'] as { channels: string[] };

    const client: WSClient = {
      ws: wsMock,
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-1',
    };
    clients.set('client-1', client);

    const sendToClient = vi.fn();

    // 1. Subscribe to a valid channel
    handleClientMessage(
      client,
      Buffer.from(JSON.stringify({ type: 'subscribe', channel: 'trades' })),
      config,
      pubsubManager,
      clients,
      sendToClient,
    );

    expect(client.channels.has('trades')).toBe(true);
    expect(sendToClient).toHaveBeenCalledWith(client, { type: 'subscribed', channel: 'trades' });

    // 2. Unsubscribe from the channel
    sendToClient.mockClear();
    handleClientMessage(
      client,
      Buffer.from(JSON.stringify({ type: 'unsubscribe', channel: 'trades' })),
      config,
      pubsubManager,
      clients,
      sendToClient,
    );

    expect(client.channels.has('trades')).toBe(false);
    expect(sendToClient).toHaveBeenCalledWith(client, { type: 'unsubscribed', channel: 'trades' });
  });

  it('should reject invalid channel subscriptions', () => {
    const adapter = new RedisWSAdapter({} as HttpServer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = adapter['clients'] as Map<string, WSClient>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = adapter['config'] as { channels: string[] };

    const client: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn() },
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-2',
    };
    clients.set('client-2', client);

    const sendToClient = vi.fn();

    handleClientMessage(
      client,
      Buffer.from(JSON.stringify({ type: 'subscribe', channel: 'invalid-channel' })),
      config,
      pubsubManager,
      clients,
      sendToClient,
    );

    expect(client.channels.has('invalid-channel')).toBe(false);
    expect(sendToClient).toHaveBeenCalledWith(client, {
      type: 'error',
      message: 'Invalid channel: invalid-channel',
    });
  });
});
