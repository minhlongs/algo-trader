/**
 * WebSocket Types
 * Shared types for BaseWebSocketClient and implementations
 */

export interface WebSocketMessage {
  type: 'orderbook' | 'trade' | 'ticker' | 'heartbeat' | 'error' | 'latency';
  exchange: string;
  symbol: string;
  data: unknown;
  timestamp: number;
  latency?: number;
}

export interface WebSocketConfig {
  url: string;
  reconnectDelay: number;
  maxReconnectDelay: number;
  heartbeatInterval: number;
  reconnectMultiplier: number;
  maxReconnectAttempts: number;
  enableJitter: boolean;
  heartbeatTimeout: number;
  latencyTracking: boolean;
}

export interface ConnectionStats {
  connectedAt?: number;
  disconnectedAt?: number;
  reconnectCount: number;
  messageCount: number;
  heartbeatCount: number;
  lastLatency?: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p95Latency: number;
  latencySamples: number[];
  uptime: number;
}

export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';
