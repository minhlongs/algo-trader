/**
 * WebSocket Heartbeat Helpers
 * Heartbeat interval/timeout orchestration
 */

import type { BaseWebSocketClient } from './websocket-client';
import { logger } from '../../shared/utils/logger';

/**
 * Start the heartbeat cycle. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function startHeartbeat(this: BaseWebSocketClient): void {
  // Virtual dispatch: subclasses (e.g. okx-ws) override stopHeartbeat to
  // clear extra timers — must go through the class method, not the helper.
  this.stopHeartbeat();

  // Send heartbeat at configured interval
  this.heartbeatTimer = setInterval(() => {
    this.pendingHeartbeat = true;
    this.sendHeartbeat();

    // Start timeout timer for heartbeat response
    this.heartbeatTimeoutTimer = setTimeout(() => {
      if (this.pendingHeartbeat) {
        logger.warn('[WebSocket] Heartbeat timeout - connection may be stale');
        this.emit('heartbeatTimeout', { timestamp: Date.now() });

        // Force reconnect if heartbeat times out
        this.forceReconnect('Heartbeat timeout');
      }
    }, this.config.heartbeatTimeout);
  }, this.config.heartbeatInterval);
}

/**
 * Stop the heartbeat cycle. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function stopHeartbeat(this: BaseWebSocketClient): void {
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
  if (this.heartbeatTimeoutTimer) {
    clearTimeout(this.heartbeatTimeoutTimer);
    this.heartbeatTimeoutTimer = null;
  }
  this.pendingHeartbeat = false;
}

/**
 * Handle a heartbeat response. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function handleHeartbeatResponse(this: BaseWebSocketClient): void {
  this.pendingHeartbeat = false;
  this.stats.heartbeatCount++;

  if (this.heartbeatTimeoutTimer) {
    clearTimeout(this.heartbeatTimeoutTimer);
    this.heartbeatTimeoutTimer = null;
  }
}