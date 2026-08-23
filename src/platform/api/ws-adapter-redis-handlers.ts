/**
 * WebSocket connection and message handlers.
 * Pure functions / parameterized handlers — no class state.
 */

import { logger } from '../../shared/utils/logger';
import type {
  WSClient,
  WSAdapterConfig,
  WSRawSocket,
} from './ws-adapter-redis-types';
import type { RedisPubSubManager } from './ws-adapter-redis-pubsub';

export type SendToClientFn = (
  client: WSClient,
  message: Record<string, unknown> | string,
) => void;

export type ClientIdGenerator = () => string;

/**
 * Handle a new WebSocket connection — register client, wire events, auto-subscribe.
 */
export function setupClientConnection(
  ws: WSRawSocket,
  clients: Map<string, WSClient>,
  config: WSAdapterConfig,
  pubsubManager: RedisPubSubManager,
  sendToClient: SendToClientFn,
  generateClientId: ClientIdGenerator,
): void {
  const clientId = generateClientId();
  const client: WSClient = {
    ws,
    channels: new Set(),
    lastPing: Date.now(),
    clientId,
  };
  clients.set(clientId, client);

  logger.info(`[WebSocket] Client ${clientId} connected`);

  ws.on('message', (data: Buffer) => {
    handleClientMessage(client, data, config, pubsubManager, clients, sendToClient);
  });

  ws.on('close', () => {
    logger.info(`[WebSocket] Client ${clientId} disconnected`);
    for (const channel of client.channels) {
      pubsubManager.removeClientFromChannel(channel, client);
    }
    clients.delete(clientId);
  });

  ws.on('error', (err: Error) => {
    logger.error(`[WebSocket] Client ${clientId} error:`, { message: err.message });
  });

  // Auto-subscribe to all configured channels on connect
  for (const channel of config.channels) {
    client.channels.add(channel);
    pubsubManager.addClientToChannel(channel, client);
  }

  logger.info(
    `[WebSocket] Client ${clientId} auto-subscribed to ${config.channels.join(', ')}`,
  );
}

/**
 * Start an interval that terminates dead connections and pings live ones.
 * Returns the timer handle for cleanup on shutdown.
 */
export function startHeartbeat(
  clients: Map<string, WSClient>,
  config: WSAdapterConfig,
): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [clientId, client] of clients) {
      const elapsed = now - client.lastPing;
      if (elapsed > config.heartbeatIntervalMs * 2) {
        logger.warn(`[WebSocket] Client ${clientId} timeout — terminating`);
        client.ws.terminate();
      } else {
        client.ws.ping();
        client.lastPing = now;
      }
    }
  }, config.heartbeatIntervalMs);
}

/**
 * Route an incoming client message to the appropriate handler.
 * Exported for testing — not part of public API.
 */
export function handleClientMessage(
  client: WSClient,
  data: Buffer,
  config: WSAdapterConfig,
  pubsubManager: RedisPubSubManager,
  clients: Map<string, WSClient>,
  sendToClient: SendToClientFn,
): void {
  try {
    const message = JSON.parse(data.toString()) as Record<string, unknown>;
    const { type, channel } = message;

    if (type === 'subscribe' && typeof channel === 'string') {
      if (config.channels.includes(channel)) {
        client.channels.add(channel);
        pubsubManager.addClientToChannel(channel, client);
        sendToClient(client, { type: 'subscribed', channel });
        logger.info(`[WebSocket] Client ${client.clientId} subscribed to ${channel}`);
      } else {
        sendToClient(client, { type: 'error', message: `Invalid channel: ${channel}` });
      }
      return;
    }

    if (type === 'unsubscribe' && typeof channel === 'string') {
      client.channels.delete(channel);
      pubsubManager.removeClientFromChannel(channel, client);
      sendToClient(client, { type: 'unsubscribed', channel });
      logger.info(`[WebSocket] Client ${client.clientId} unsubscribed from ${channel}`);
      return;
    }

    if (type === 'ping') {
      sendToClient(client, { type: 'pong', timestamp: Date.now() });
      return;
    }

    sendToClient(client, { type: 'error', message: 'Unknown message type' });
  } catch (err) {
    logger.error('[WebSocket] Invalid message:', { err });
  }
}
