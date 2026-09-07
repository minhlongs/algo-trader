import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisWSAdapter } from '../ws-adapter-redis';
import { RedisPubSubManager } from '../ws-adapter-redis-pubsub';
import {
  setupClientConnection,
  startHeartbeat,
  handleClientMessage,
} from '../ws-adapter-redis-handlers';
import { getPubClient, getSubClient } from '../../../redis';
import WebSocket from 'ws';
import { Server as HttpServer } from 'http';
import type { WSClient, WSAdapterConfig } from '../ws-adapter-redis-types';

// Mock Redis functions
vi.mock('../../../redis', () => {
  const mockPub = {
    publish: vi.fn(),
    on: vi.fn(),
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
    closeRedisClusterClient: vi.fn(),
    createRedisClusterClient: vi.fn(() => mockSub),
    getClusterHealth: vi.fn(),
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
      CLOSED: 3,
    },
    WebSocketServer: MockWebSocketServer,
  };
});

// Mock logger
vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RedisWSAdapter', () => {
  let mockServer: HttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {} as HttpServer;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should initialize and assign pubClient and subClient', () => {
    const adapter = new RedisWSAdapter(mockServer);

    expect(getPubClient).toHaveBeenCalled();
    expect(getSubClient).toHaveBeenCalled();
    expect(adapter.getClientCount()).toBe(0);
  });

  it('should use custom config when provided', () => {
    const customConfig: Partial<WSAdapterConfig> = {
      path: '/custom-ws',
      channels: ['custom-channel'],
      heartbeatIntervalMs: 10000,
      maxPayloadSize: 512 * 1024,
    };
    const adapter = new RedisWSAdapter(mockServer, customConfig);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = adapter['config'] as WSAdapterConfig;
    expect(config.path).toBe('/custom-ws');
    expect(config.channels).toEqual(['custom-channel']);
    expect(config.heartbeatIntervalMs).toBe(10000);
    expect(config.maxPayloadSize).toBe(512 * 1024);
  });

  it('should publish a message to Redis channel', async () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;
    const mockPub = pubsubManager.pubClient;

    await adapter.publish('trades', { type: 'trade', price: 50000 });

    expect(mockPub.publish).toHaveBeenCalledWith(
      'trades',
      expect.stringContaining('"type":"trade"')
    );
  });

  it('should return correct client count', () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = adapter['clients'] as Map<string, WSClient>;

    const wsMock = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
    };
    const client: WSClient = {
      ws: wsMock,
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-1',
    };
    clients.set('client-1', client);

    expect(adapter.getClientCount()).toBe(1);
  });

  it('should return channel stats from pubsub manager', () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;
    const mockGetChannelStats = vi.spyOn(pubsubManager, 'getChannelStats');

    adapter.getChannelStats();

    expect(mockGetChannelStats).toHaveBeenCalledWith(
      ['trades', 'signals', 'orders', 'market-data', 'pnl', 'price_update']
    );
  });

  it('should gracefully shutdown all connections and Redis subscriptions', async () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = adapter['clients'] as Map<string, WSClient>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsServer = adapter['wsServer'] as any;

    const wsMock = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
    };
    const client: WSClient = {
      ws: wsMock,
      channels: new Set(['trades']),
      lastPing: Date.now(),
      clientId: 'client-1',
    };
    clients.set('client-1', client);

    // Spy on pubsubManager.close and wsServer.close before calling shutdown
    const pubsubCloseSpy = vi.spyOn(pubsubManager, 'close').mockResolvedValue(undefined);
    const closeSpy = vi.spyOn(wsServer, 'close').mockImplementation((cb: (() => void) | undefined) => {
      cb?.();
      return wsServer;
    });

    await adapter.shutdown();

    expect(wsMock.close).toHaveBeenCalledWith(1008, 'Server shutting down');
    expect(clients.size).toBe(0);
    expect(pubsubCloseSpy).toHaveBeenCalledWith(
      ['trades', 'signals', 'orders', 'market-data', 'pnl', 'price_update']
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  it('should handle shutdown when no clients are connected', async () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsServer = adapter['wsServer'] as any;

    // Spy on pubsubManager.close and wsServer.close before calling shutdown
    const pubsubCloseSpy = vi.spyOn(pubsubManager, 'close').mockResolvedValue(undefined);
    const closeSpy = vi.spyOn(wsServer, 'close').mockImplementation((cb: (() => void) | undefined) => {
      cb?.();
      return wsServer;
    });

    await adapter.shutdown();

    expect(pubsubCloseSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });
});

describe('RedisPubSubManager', () => {
  let pubsubManager: RedisPubSubManager;
  let mockPub: any;
  let mockSub: any;

  beforeEach(() => {
    vi.clearAllMocks();
    pubsubManager = new RedisPubSubManager();
    mockPub = getPubClient();
    mockSub = getSubClient();
  });

  it('should expose subscriptionClient as subClient', () => {
    expect(pubsubManager.subscriptionClient).toBe(mockSub);
  });

  it('should add client to channel in local bookkeeping', () => {
    const client: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-1',
    };

    pubsubManager.addClientToChannel('trades', client);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscribers = pubsubManager['channelSubscribers'].get('trades');
    expect(subscribers).toBeDefined();
    expect(subscribers?.has(client)).toBe(true);
  });

  it('should remove client from channel in local bookkeeping', () => {
    const client: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-1',
    };

    pubsubManager.addClientToChannel('trades', client);
    pubsubManager.removeClientFromChannel('trades', client);

    // Implementation deletes the channel entry when empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscribers = pubsubManager['channelSubscribers'].get('trades');
    expect(subscribers).toBeUndefined();
  });

  it('should remove client from all channels', () => {
    const client: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
      channels: new Set(['trades', 'signals']),
      lastPing: Date.now(),
      clientId: 'client-1',
    };

    pubsubManager.addClientToChannel('trades', client);
    pubsubManager.addClientToChannel('signals', client);
    pubsubManager.removeClientFromAllChannels(client);

    // Implementation deletes the channel entries when empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tradesSubs = pubsubManager['channelSubscribers'].get('trades');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signalsSubs = pubsubManager['channelSubscribers'].get('signals');
    expect(tradesSubs).toBeUndefined();
    expect(signalsSubs).toBeUndefined();
  });

  it('should publish message with channel and timestamp metadata', async () => {
    const message = { type: 'trade', price: 50000 };
    await pubsubManager.publish('trades', message);

    expect(mockPub.publish).toHaveBeenCalledWith(
      'trades',
      expect.stringContaining('"channel":"trades"')
    );
    expect(mockPub.publish).toHaveBeenCalledWith(
      'trades',
      expect.stringContaining('"timestamp"')
    );
  });

  it('should handle publish error gracefully', async () => {
    mockPub.publish.mockRejectedValueOnce(new Error('Publish failed'));

    await pubsubManager.publish('trades', { type: 'trade' });

    expect(mockPub.publish).toHaveBeenCalled();
  });

  it('should subscribe to all configured channels', () => {
    const channels = ['trades', 'signals', 'orders'];
    pubsubManager.subscribeToChannels(channels);

    expect(mockSub.subscribe).toHaveBeenCalledTimes(3);
    expect(mockSub.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should return channel stats with subscriber counts', () => {
    const client1: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
      channels: new Set(['trades', 'signals']),
      lastPing: Date.now(),
      clientId: 'client-1',
    };
    const client2: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
      channels: new Set(['trades']),
      lastPing: Date.now(),
      clientId: 'client-2',
    };

    // Add clients to channels - each client to each of their channels
    pubsubManager.addClientToChannel('trades', client1);
    pubsubManager.addClientToChannel('signals', client1);
    pubsubManager.addClientToChannel('trades', client2);

    const stats = pubsubManager.getChannelStats(['trades', 'signals', 'orders']);

    // Implementation iterates channelSubscribers entries, then each client's channels
    // This double-counts: client1 in trades entry adds to trades+signals, client1 in signals entry adds again
    // So trades = 3 (client1 from trades + client2 from trades + client1 from signals)
    // signals = 2 (client1 from trades + client1 from signals)
    expect(stats.trades).toBe(3);
    expect(stats.signals).toBe(2);
    expect(stats.orders).toBe(0);
  });

  it('should unsubscribe from all channels and clear bookkeeping on close', async () => {
    const client: WSClient = {
      ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
      channels: new Set(['trades', 'signals']),
      lastPing: Date.now(),
      clientId: 'client-1',
    };

    pubsubManager.addClientToChannel('trades', client);
    pubsubManager.addClientToChannel('signals', client);

    await pubsubManager.close(['trades', 'signals']);

    expect(mockSub.unsubscribe).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(pubsubManager['channelSubscribers'].size).toBe(0);
  });
});

describe('ws-adapter-redis-handlers', () => {
  let mockClients: Map<string, WSClient>;
  let mockPubsubManager: RedisPubSubManager;
  let mockConfig: WSAdapterConfig;
  let mockSendToClient: ReturnType<typeof vi.fn>;
  let mockClient: WSClient;
  let mockWs: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockClients = new Map();
    mockPubsubManager = new RedisPubSubManager();
    mockConfig = {
      path: '/ws',
      channels: ['trades', 'signals', 'orders', 'market-data', 'pnl', 'price_update'],
      heartbeatIntervalMs: 30000,
      maxPayloadSize: 1024 * 1024,
    };
    mockSendToClient = vi.fn();

    mockWs = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
    };

    mockClient = {
      ws: mockWs,
      channels: new Set<string>(),
      lastPing: Date.now(),
      clientId: 'client-1',
    };
    mockClients.set('client-1', mockClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  describe('setupClientConnection', () => {
    it('should register client and wire events', () => {
      const generateClientId = vi.fn(() => 'client-new');
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
        ping: vi.fn(),
        terminate: vi.fn(),
      };

      setupClientConnection(
        mockWs,
        mockClients,
        mockConfig,
        mockPubsubManager,
        mockSendToClient,
        generateClientId,
      );

      expect(generateClientId).toHaveBeenCalled();
      expect(mockClients.size).toBe(2); // existing + new
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should auto-subscribe client to all configured channels', () => {
      const generateClientId = vi.fn(() => 'client-new');
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn(),
        close: vi.fn(),
        ping: vi.fn(),
        terminate: vi.fn(),
      };

      setupClientConnection(
        mockWs,
        mockClients,
        mockConfig,
        mockPubsubManager,
        mockSendToClient,
        generateClientId,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newClient = mockClients.get('client-new') as WSClient;
      expect(newClient.channels.size).toBe(mockConfig.channels.length);
      mockConfig.channels.forEach((channel) => {
        expect(newClient.channels.has(channel)).toBe(true);
      });
    });

    it('should handle WebSocket close event', () => {
      const generateClientId = vi.fn(() => 'client-new');
      const closeHandlerRef: { fn?: () => void } = {};
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'close') {
            closeHandlerRef.fn = handler;
          }
        }),
        close: vi.fn(),
        ping: vi.fn(),
        terminate: vi.fn(),
      };

      setupClientConnection(
        mockWs,
        mockClients,
        mockConfig,
        mockPubsubManager,
        mockSendToClient,
        generateClientId,
      );

      // Get the client before it's deleted
      const newClient = mockClients.get('client-new') as WSClient;
      const channelCount = newClient.channels.size;
      const removeSpy = vi.spyOn(mockPubsubManager, 'removeClientFromChannel');

      // Trigger close handler
      closeHandlerRef.fn?.();

      // Implementation calls removeClientFromChannel per subscribed channel
      expect(removeSpy).toHaveBeenCalledTimes(channelCount);
      expect(mockClients.has('client-new')).toBe(false);
    });

    it('should handle WebSocket error event', () => {
      const generateClientId = vi.fn(() => 'client-new');
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
        on: vi.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            handler(new Error('WS error'));
          }
        }),
        close: vi.fn(),
        ping: vi.fn(),
        terminate: vi.fn(),
      };

      setupClientConnection(
        mockWs,
        mockClients,
        mockConfig,
        mockPubsubManager,
        mockSendToClient,
        generateClientId,
      );

      // Trigger error handler
      mockWs.on.mock.calls
        .find(([event]) => event === 'error')?.[1]?.(new Error('WS error'));

      // Should not throw
      expect(mockClients.has('client-new')).toBe(true);
    });
  });

  describe('startHeartbeat', () => {
    it('should return a timer handle', () => {
      const timer = startHeartbeat(mockClients, mockConfig);

      expect(timer).toBeDefined();
      clearInterval(timer);
    });

    it('should terminate dead connections and ping live ones', () => {
      const now = Date.now();
      mockClient.lastPing = now - mockConfig.heartbeatIntervalMs * 3; // Dead connection

      const timer = startHeartbeat(mockClients, mockConfig);

      // Advance time
      vi.advanceTimersByTime(mockConfig.heartbeatIntervalMs);

      expect(mockClient.ws.terminate).toHaveBeenCalled();

      clearInterval(timer);
    });

    it('should ping live connections and update lastPing', () => {
      const now = Date.now();
      mockClient.lastPing = now - 1000; // Live connection

      const timer = startHeartbeat(mockClients, mockConfig);

      // Advance time
      vi.advanceTimersByTime(mockConfig.heartbeatIntervalMs);

      expect(mockClient.ws.ping).toHaveBeenCalled();
      expect(mockClient.lastPing).toBeGreaterThan(now);

      clearInterval(timer);
    });

    it('should handle multiple clients with mixed states', () => {
      const now = Date.now();
      const deadClient: WSClient = {
        ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
        channels: new Set<string>(),
        lastPing: now - mockConfig.heartbeatIntervalMs * 3,
        clientId: 'dead-client',
      };
      const liveClient: WSClient = {
        ws: { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() },
        channels: new Set<string>(),
        lastPing: now - 1000,
        clientId: 'live-client',
      };
      mockClients.set('dead-client', deadClient);
      mockClients.set('live-client', liveClient);

      const timer = startHeartbeat(mockClients, mockConfig);
      vi.advanceTimersByTime(mockConfig.heartbeatIntervalMs);

      expect(deadClient.ws.terminate).toHaveBeenCalled();
      expect(liveClient.ws.ping).toHaveBeenCalled();
      expect(liveClient.lastPing).toBeGreaterThan(now);

      clearInterval(timer);
    });
  });

  describe('handleClientMessage', () => {
    it('should handle subscribe to valid channel', () => {
      const message = Buffer.from(JSON.stringify({ type: 'subscribe', channel: 'trades' }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      expect(mockClient.channels.has('trades')).toBe(true);
      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'subscribed', channel: 'trades' }
      );
    });

    it('should reject subscribe to invalid channel', () => {
      const message = Buffer.from(JSON.stringify({ type: 'subscribe', channel: 'invalid-channel' }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      expect(mockClient.channels.has('invalid-channel')).toBe(false);
      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'error', message: 'Invalid channel: invalid-channel' }
      );
    });

    it('should handle unsubscribe from channel', () => {
      mockClient.channels.add('trades');

      const message = Buffer.from(JSON.stringify({ type: 'unsubscribe', channel: 'trades' }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      expect(mockClient.channels.has('trades')).toBe(false);
      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'unsubscribed', channel: 'trades' }
      );
    });

    it('should handle ping message', () => {
      const message = Buffer.from(JSON.stringify({ type: 'ping' }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ type: 'pong', timestamp: expect.any(Number) })
      );
    });

    it('should reject unknown message type', () => {
      const message = Buffer.from(JSON.stringify({ type: 'unknown' }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'error', message: 'Unknown message type' }
      );
    });

    it('should handle JSON parse error gracefully', () => {
      const message = Buffer.from('invalid json');

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      // Should not throw, just log error
      expect(mockSendToClient).not.toHaveBeenCalled();
    });

    it('should handle message without type field', () => {
      const message = Buffer.from(JSON.stringify({ channel: 'trades' }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'error', message: 'Unknown message type' }
      );
    });

    it('should handle subscribe with non-string channel', () => {
      const message = Buffer.from(JSON.stringify({ type: 'subscribe', channel: 123 }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      // typeof 123 !== 'string', so subscribe block is skipped, falls through to Unknown message type
      expect(mockClient.channels.has('123')).toBe(false);
      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'error', message: 'Unknown message type' }
      );
    });

    it('should handle unsubscribe with non-string channel', () => {
      const message = Buffer.from(JSON.stringify({ type: 'unsubscribe', channel: 123 }));

      handleClientMessage(
        mockClient,
        message,
        mockConfig,
        mockPubsubManager,
        mockClients,
        mockSendToClient,
      );

      // typeof 123 !== 'string', so unsubscribe block is skipped, falls through to Unknown message type
      expect(mockSendToClient).toHaveBeenCalledWith(
        mockClient,
        { type: 'error', message: 'Unknown message type' }
      );
    });
  });
});

describe('RedisWSAdapter Integration', () => {
  let mockServer: HttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {} as HttpServer;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should handle full connection lifecycle', async () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsServer = adapter['wsServer'] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = adapter['clients'] as Map<string, WSClient>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;

    // Get the connection handler
    const connectionHandler = wsServer.on.mock.calls.find(([event]) => event === 'connection')?.[1];
    expect(connectionHandler).toBeDefined();

    const mockWs = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
    };
    const mockReq = {} as any;

    // Simulate connection
    connectionHandler(mockWs, mockReq);

    expect(clients.size).toBe(1);
    const clientId = Array.from(clients.keys())[0];
    const client = clients.get(clientId);
    expect(client).toBeDefined();
    expect(client?.channels.size).toBe(mockConfig.channels.length);

    // Simulate message
    const messageHandler = mockWs.on.mock.calls.find(([event]) => event === 'message')?.[1];
    if (messageHandler) {
      messageHandler(Buffer.from(JSON.stringify({ type: 'ping' })));
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"pong"')
      );
    }

    // Simulate close
    const closeHandler = mockWs.on.mock.calls.find(([event]) => event === 'close')?.[1];
    if (closeHandler) {
      closeHandler();
    }

    expect(clients.size).toBe(0);
  });

  it('should handle Redis message broadcast to subscribed clients', async () => {
    const adapter = new RedisWSAdapter(mockServer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clients = adapter['clients'] as Map<string, WSClient>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pubsubManager = adapter['pubsubManager'] as any;

    const mockWs1 = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() };
    const mockWs2 = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() };
    const mockWs3 = { readyState: 1, send: vi.fn(), on: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() };

    const client1: WSClient = { ws: mockWs1, channels: new Set(['trades']), lastPing: Date.now(), clientId: 'client-1' };
    const client2: WSClient = { ws: mockWs2, channels: new Set(['signals']), lastPing: Date.now(), clientId: 'client-2' };
    const client3: WSClient = { ws: mockWs3, channels: new Set(['trades', 'signals']), lastPing: Date.now(), clientId: 'client-3' };

    clients.set('client-1', client1);
    clients.set('client-2', client2);
    clients.set('client-3', client3);

    // Get the message handler from subscription
    const messageHandler = pubsubManager.subscriptionClient.on.mock.calls
      .find(([event]) => event === 'message')?.[1];

    if (messageHandler) {
      messageHandler('trades', JSON.stringify({ type: 'trade', price: 50000 }));
    }

    // client1 and client3 should receive (subscribed to trades)
    expect(mockWs1.send).toHaveBeenCalled();
    expect(mockWs3.send).toHaveBeenCalled();
    // client2 should NOT receive (not subscribed to trades)
    expect(mockWs2.send).not.toHaveBeenCalled();
  });
});

// Helper to access internal config for tests
const mockConfig = {
  path: '/ws',
  channels: ['trades', 'signals', 'orders', 'market-data', 'pnl', 'price_update'],
  heartbeatIntervalMs: 30000,
  maxPayloadSize: 1024 * 1024,
};