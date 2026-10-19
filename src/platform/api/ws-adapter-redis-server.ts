import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { logger } from '../../shared/utils/logger';
import type { WSAdapterConfig, WSClient } from './ws-adapter-redis-types';

export function createWebSocketServer(server: HttpServer, config: WSAdapterConfig): WebSocketServer {
  return new WebSocketServer({
    server,
    path: config.path,
    maxPayload: config.maxPayloadSize,
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
}

/** Send a JSON payload to a single connected client. */
export function sendToClient(
  client: WSClient,
  message: Record<string, unknown> | string,
): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    try {
      client.ws.send(typeof message === 'string' ? message : JSON.stringify(message));
    } catch {
      logger.error(`[WebSocket] Failed to send to ${client.clientId}`);
    }
  }
}

/** Forward a raw Redis message to all local subscribers of a channel. */
export function broadcastToChannel(
  clients: Map<string, WSClient>,
  channel: string,
  message: string,
): void {
  for (const [, client] of clients) {
    if (client.channels.has(channel)) {
      sendToClient(client, message);
    }
  }
}
