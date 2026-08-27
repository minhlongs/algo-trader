/**
 * Base WebSocket Client - Enhanced
 * Foundation for exchange-specific WebSocket connections
 * Features: auto-reconnect with jitter, heartbeat monitoring, latency tracking
 */

import { EventEmitter } from 'events';
import { logger } from '../../shared/utils/logger';

// --- Re-export types (facade) ---
export type { WebSocketMessage, WebSocketConfig, ConnectionStats, WebSocketState } from './ws-types';

// --- Re-export helpers (facade) ---
export { computeReconnectDelay, scheduleReconnect } from './ws-reconnect';
export { startHeartbeat, stopHeartbeat, handleHeartbeatResponse } from './ws-heartbeat';
export { forceReconnect } from './ws-force-reconnect';
export { connectWebSocket, waitForConnection } from './ws-connection';
export { computeLatencyStats, recordLatency, type LatencyStatsResult } from './ws-latency-stats';

import type { WebSocketMessage, WebSocketConfig, ConnectionStats, WebSocketState } from './ws-types';
import { scheduleReconnect } from './ws-reconnect';
import { startHeartbeat, stopHeartbeat, handleHeartbeatResponse } from './ws-heartbeat';
import { forceReconnect } from './ws-force-reconnect';
import { connectWebSocket, waitForConnection } from './ws-connection';
import { computeLatencyStats, recordLatency } from './ws-latency-stats';

export abstract class BaseWebSocketClient extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected config: WebSocketConfig;
  protected reconnectAttempts = 0;
  protected heartbeatTimer: NodeJS.Timeout | null = null;
  protected heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  protected messageHandlers: Set<(msg: WebSocketMessage) => void> = new Set();
  protected state: WebSocketState = 'disconnected';
  protected stats: ConnectionStats;
  protected lastMessageTime: number = 0;
  protected pendingHeartbeat: boolean = false;
  protected reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<WebSocketConfig>) {
    super();
    this.config = {
      url: config.url || '',
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectDelay: config.maxReconnectDelay || 30000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      reconnectMultiplier: config.reconnectMultiplier || 2,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      enableJitter: config.enableJitter ?? true,
      heartbeatTimeout: config.heartbeatTimeout || 10000,
      latencyTracking: config.latencyTracking ?? true,
    };

    this.stats = {
      reconnectCount: 0,
      messageCount: 0,
      heartbeatCount: 0,
      avgLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      p95Latency: 0,
      latencySamples: [],
      uptime: 0,
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract subscribe(symbols: string[]): Promise<void>;
  abstract unsubscribe(symbols: string[]): Promise<void>;

  protected abstract handleMessage(data: unknown): WebSocketMessage | null;
  protected abstract getSubscriptions(symbols: string[]): unknown;
  protected abstract sendHeartbeat(): void;

  public onMessage(handler: (msg: WebSocketMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  public offMessage(handler: (msg: WebSocketMessage) => void): void {
    this.messageHandlers.delete(handler);
  }

  public getState(): WebSocketState {
    return this.state;
  }

  public getStats(): ConnectionStats {
    const now = Date.now();
    if (this.state === 'connected' && this.stats.connectedAt) {
      this.stats.uptime = now - this.stats.connectedAt;
    }
    this.recalculateLatencyStats();
    return { ...this.stats };
  }

  public isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  protected connectWebSocket(): Promise<void> {
    return connectWebSocket.call(this);
  }

  protected sendMessage(message: unknown): boolean {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify(message));
      return true;
    }
    logger.warn('[WebSocket] Cannot send message - not connected');
    return false;
  }

  protected scheduleReconnect(): void {
    scheduleReconnect.call(this);
  }

  protected startHeartbeat(): void {
    startHeartbeat.call(this);
  }

  protected stopHeartbeat(): void {
    stopHeartbeat.call(this);
  }

  protected handleHeartbeatResponse(): void {
    handleHeartbeatResponse.call(this);
  }

  protected recalculateLatencyStats(): void {
    const { avgLatency, p95Latency } = computeLatencyStats(this.stats.latencySamples);
    this.stats.avgLatency = avgLatency;
    this.stats.p95Latency = p95Latency;
  }

  protected recordLatency(latency: number): void {
    recordLatency.call(this, latency);
  }

  protected forceReconnect(reason: string): void {
    forceReconnect.call(this, reason);
  }

  /**
   * Wait for connection with timeout
   */
  public waitForConnection(timeout: number = 10000): Promise<boolean> {
    return waitForConnection.call(this, timeout);
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      reconnectCount: this.stats.reconnectCount,
      messageCount: 0,
      heartbeatCount: 0,
      avgLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      p95Latency: 0,
      latencySamples: [],
      uptime: 0,
    };
  }
}
