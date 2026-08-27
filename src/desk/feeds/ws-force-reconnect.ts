/**
 * WebSocket Force Reconnect Helper
 * Force reconnect orchestration
 */

import type { BaseWebSocketClient } from './websocket-client';
import { logger } from '../../shared/utils/logger';

/**
 * Force a reconnect. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function forceReconnect(this: BaseWebSocketClient, reason: string): void {
  logger.info(`[WebSocket] Force reconnect: ${reason}`);

  this.emit('forceReconnect', { reason, timestamp: Date.now() });

  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  if (this.ws) {
    this.ws.close();
    this.ws = null;
  }

  this.reconnectAttempts = 0;
  this.scheduleReconnect();
}