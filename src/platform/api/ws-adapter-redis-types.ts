/**
 * Types for WebSocket Adapter with Redis Cluster.
 * Extracted for reuse across pub/sub manager and handler modules.
 *
 * Design note: WSClient.ws is typed as `any` because the @types/ws global
 * `WebSocket` and @cloudflare/workers-types global `WebSocket` merge into a
 * hybrid type that lacks the methods we need (on, ping, terminate).
 * Actual type safety is enforced at the call site where wsServer.on('connection')
 * provides the correctly-typed instance.
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
 * Metadata for a connected WebSocket client.
 * The `ws` field holds the raw WebSocket instance from the ws library.
 */
export interface WSClient {
  clientId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any;
  channels: Set<string>;
  lastPing: number;
}
