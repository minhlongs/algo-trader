/**
 * OrderBookStream — reconnection logic.
 * Extracted from orderbook-stream.ts. Bodies moved VERBATIM; only `this.` → `ctx.`.
 * Structural ctx interface avoids facade→leaf→facade import cycle (no `import type { OrderBookStream }`).
 */

import WebSocket from 'ws';
import { logger } from '../../shared/utils/logger';
import { type TradingEventBus } from '../events/trading-event-bus';
import {
  HEARTBEAT_INTERVAL_MS,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  WS_URL,
} from './orderbook-stream-types';

/** Structural view of the OrderBookStream facade that reconnect/disconnect leaves need. */
export interface OrderBookStreamReconnectCtx {
  ws: WebSocket | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  closed: boolean;
  eventBus: TradingEventBus;
  connect(): void;
  scheduleReconnect(): void;
  clearReconnectTimer(): void;
  stopHeartbeat(): void;
  emit(event: string | symbol, ...args: unknown[]): boolean;
}

/** Schedule a reconnect attempt with exponential backoff. */
export function scheduleReconnect(ctx: OrderBookStreamReconnectCtx): void {
  if (ctx.closed) return;

  ctx.reconnectAttempts++;

  if (ctx.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    logger.error('[OrderBookStream] Max reconnect attempts reached, giving up', {
      attempts: ctx.reconnectAttempts,
    });
    ctx.eventBus.emitConnectionStatus({
      component: 'OrderBookStream',
      status: 'error',
      timestamp: Date.now(),
      error: `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`,
      retryAttempt: ctx.reconnectAttempts,
    });
    return;
  }

  const delay = Math.min(RECONNECT_BASE_MS * 2 ** (ctx.reconnectAttempts - 1), RECONNECT_MAX_MS);

  logger.info('[OrderBookStream] Scheduling reconnect', {
    attempt: ctx.reconnectAttempts,
    delayMs: delay,
  });

  ctx.eventBus.emitConnectionStatus({
    component: 'OrderBookStream',
    status: 'reconnecting',
    timestamp: Date.now(),
    retryAttempt: ctx.reconnectAttempts,
    nextRetryMs: delay,
  });

  ctx.clearReconnectTimer();
  ctx.reconnectTimer = setTimeout(() => ctx.connect(), delay);
}

/** Handle a WebSocket close event: stop heartbeat, emit status, schedule reconnect. */
export function handleDisconnect(
  ctx: OrderBookStreamReconnectCtx,
  code: number,
  reason: Buffer
): void {
  logger.warn('[OrderBookStream] Disconnected', { code, reason: reason.toString() });
  ctx.stopHeartbeat();

  ctx.emit('disconnected', { code, reason: reason.toString() });
  ctx.eventBus.emitConnectionStatus({
    component: 'OrderBookStream',
    status: 'disconnected',
    timestamp: Date.now(),
    error: `Code ${code}: ${reason.toString()}`,
  });

  if (!ctx.closed) {
    ctx.scheduleReconnect();
  }
}