/**
 * WebSocket Reconnect Helpers
 * Reconnect-delay math + reconnect orchestration
 */

import type { BaseWebSocketClient } from './websocket-client';
import type { WebSocketConfig } from './ws-types';
import { logger } from '../../shared/utils/logger';

/**
 * Compute reconnect delay with exponential backoff and optional jitter.
 * Pure function — no instance state.
 * @param attempts Number of reconnect attempts so far
 * @param config WebSocket configuration
 * @returns Delay in milliseconds before next reconnect attempt
 */
export function computeReconnectDelay(attempts: number, config: WebSocketConfig): number {
  // Exponential backoff
  let delay = Math.min(
    config.reconnectDelay * Math.pow(config.reconnectMultiplier, attempts),
    config.maxReconnectDelay,
  );

  // Add ±20% jitter to prevent thundering herd
  if (config.enableJitter) {
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    delay += jitter;
  }

  // Ensure non-negative delay
  return Math.max(0, delay);
}

/**
 * Schedule a reconnect attempt. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function scheduleReconnect(this: BaseWebSocketClient): void {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
  }

  this.state = 'reconnecting';
  this.stats.reconnectCount++;

  const delay = computeReconnectDelay(this.reconnectAttempts, this.config);

  this.reconnectAttempts++;

  logger.info(
    `[WebSocket] Reconnecting in ${Math.round(delay)}ms ` +
      `(attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`,
  );

  this.emit('reconnecting', {
    attempt: this.reconnectAttempts,
    maxAttempts: this.config.maxReconnectAttempts,
    delay,
  });

  this.reconnectTimer = setTimeout(() => {
    this.reconnectTimer = null;
    this.connect().catch((error) => {
      logger.error('[WebSocket] Reconnect failed:', { error });
    });
  }, delay);
}