/**
 * WebSocket Adapter with Redis Cluster — orchestrator + barrel re-exports.
 * Handles 1000+ concurrent WebSocket connections with cluster-aware pub/sub.
 *
 * Features:
 * - Redis Cluster pub/sub for horizontal scaling
 * - Multi-channel support (trades, signals, orders, market-data, pnl, price_update)
 * - Automatic reconnection on failover
 * - Message deduplication with idempotency
 *
 * Sub-modules:
 * - ws-adapter-redis-types   – WSAdapterConfig, WSClient
 * - ws-adapter-redis-pubsub  – RedisPubSubManager (Redis pub/sub lifecycle)
 * - ws-adapter-redis-handlers – WebSocket event handlers (setup, message, heartbeat)
 */

import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { logger } from '../../shared/utils/logger';

import type { WSAdapterConfig, WSClient } from './ws-adapter-redis-types';
import { DEFAULT_CONFIG } from './ws-adapter-redis-types';
import { RedisPubSubManager } from './ws-adapter-redis-pubsub';
import {
  setupClientConnection,
  startHeartbeat,
} from './ws-adapter-redis-handlers';

// Re-export public API for backward compatibility
export type { WSAdapterConfig } from './ws-adapter-redis-types';
export { RedisPubSubManager } from './ws-adapter-redis-pubsub';

export class RedisWSAdapter {
  private wsServer: WebSocketServer;
  private clients: Map<string, WSClient> = new Map();
  private clientIdCounter = 0;
  private heartbeatTimer?: NodeJS.Timeout;
  private pubsubManager: RedisPubSubManager;
  private config: WSAdapterConfig;

  constructor(
    private server: HttpServer,
    config?: Partial<WSAdapterConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pubsubManager = new RedisPubSubManager();

    this.wsServer = new WebSocketServer({
      server: this.server,
      path: this.config.path,
      maxPayload: this.config.maxPayloadSize,
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 3,
          memLevel: 8,
          windowBits: 12,
        },
        zlibInflateOptions: {
          chunkSize: 10 * 1024,
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 12,
        concurrencyLimit: 20,
        threshold: 1024,
      },
    });

    this.setupWebSocket();
    this.setupSubscription();
    this.startHeartbeat();
  }

  /** Bind the WebSocketServer connection listener. */
  private setupWebSocket(): void {
    // The ws parameter in this callback is correctly typed by @types/ws.
    // We pass it directly to setupClientConnection to preserve the type.
    this.wsServer.on('connection', (ws: WebSocket, _req: import('http').IncomingMessage) => {
      setupClientConnection(
        ws,
        this.clients,
        this.config,
        this.pubsubManager,
        this.sendToClient,
        this.generateClientId,
      );
    });

    this.wsServer.on('error', (err) => {
      logger.error('[RedisWS] Server error:', { err });
    });
  }

  /** Subscribe to Redis channels and wire the message listener. */
  private setupSubscription(): void {
    this.pubsubManager.subscribeToChannels(this.config.channels);

    this.pubsubManager.subscriptionClient.on(
      'message',
      (channel: string, message: string) => {
        this.broadcastToChannel(channel, message);
      },
    );
  }

  /** Start the heartbeat interval for dead-connection detection. */
  private startHeartbeat(): void {
    this.heartbeatTimer = startHeartbeat(this.clients, this.config);
  }

  /** Generate a simple incrementing client ID. */
  private generateClientId = (): string =>
    `client-${Date.now()}-${++this.clientIdCounter}`;

  /** Send a JSON payload to a single connected client. */
  private sendToClient = (
    client: WSClient,
    message: Record<string, unknown> | string,
  ): void => {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
      } catch {
        logger.error(`[WebSocket] Failed to send to ${client.clientId}`);
      }
    }
  };

  /** Forward a raw Redis message to all local subscribers of a channel. */
  private broadcastToChannel(channel: string, message: string): void {
    for (const [, client] of this.clients) {
      if (client.channels.has(channel)) {
        this.sendToClient(client, message);
      }
    }
  }

  /** Publish a message to a Redis channel (returns when Redis confirms). */
  async publish(
    channel: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    return this.pubsubManager.publish(channel, message);
  }

  /** Number of currently connected WebSocket clients. */
  getClientCount(): number {
    return this.clients.size;
  }

  /** Per-channel subscriber counts. */
  getChannelStats(): Record<string, number> {
    return this.pubsubManager.getChannelStats(this.config.channels);
  }

  /** Gracefully shut down all connections and Redis subscriptions. */
  async shutdown(): Promise<void> {
    logger.info('[RedisWS] Shutting down...');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Close every WebSocket connection
    for (const [, client] of this.clients) {
      try {
        client.ws.close(1008, 'Server shutting down');
      } catch {
        // ignore close errors during shutdown
      }
    }
    this.clients.clear();

    // Unsubscribe from all Redis channels
    await this.pubsubManager.close(this.config.channels);

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      this.wsServer.close(() => resolve());
    });

    logger.info('[RedisWS] Shutdown complete');
  }
}

/**
 * Factory: create and return a configured RedisWSAdapter.
 */
export async function registerWebSocketAdapter(
  server: HttpServer,
  config?: Partial<WSAdapterConfig>,
): Promise<RedisWSAdapter> {
  return new RedisWSAdapter(server, config);
}
