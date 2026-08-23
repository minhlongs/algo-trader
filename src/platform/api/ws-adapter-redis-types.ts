/**
 * Types for WebSocket Adapter with Redis Cluster.
 * Extracted for reuse across pub/sub manager and handler modules.
 */

/** Configuration for the WebSocket-Redis adapter. */
export interface WSAdapterConfig {
  path: string;
  channels: string[];
  heartbeatIntervalMs: number;
  maxPayloadSize: number;
}

/** Default adapter configuration — 6 channels, 1 MB payload, 30 s heartbeat. */
export const DEFAULT_CONFIG: WSAdapterConfig = {
  path: '/ws',
  channels: ['trades', 'signals', 'orders', 'market-data', 'pnl', 'price_update'],
  heartbeatIntervalMs: 30_000,
  maxPayloadSize: 1024 * 1024,
};

/**
 * Structural view of the raw socket methods this adapter calls.
 *
 * Declared locally because @types/ws and @cloudflare/workers-types merge their
 * global WebSocket declarations into a hybrid type that lacks ping/terminate,
 * while the actual instance comes from the ws library's WebSocketServer and
 * provides them. The instance passed at runtime is structurally compatible.
 */
export interface WSRawSocket {
  /** Connection state constant — compare against WebSocket.OPEN. */
  readonly readyState: number;
  on(event: 'message', listener: (data: Buffer) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  /** Protocol-level ping frame for heartbeats. */
  ping(): void;
  /** Hard-close without the closing handshake (dead-connection cleanup). */
  terminate(): void;
}

/**
 * Metadata for a connected WebSocket client.
 * The `ws` field holds the raw WebSocket instance from the ws library.
 */
export interface WSClient {
  clientId: string;
  ws: WSRawSocket;
  channels: Set<string>;
  lastPing: number;
}
