/**
 * WebSocket Connection Helpers
 * Connection lifecycle orchestration
 */

import type { BaseWebSocketClient } from './websocket-client';
import { logger } from '../../shared/utils/logger';

/**
 * Connect the WebSocket. Stateful helper bound to a BaseWebSocketClient
 * via the `this` parameter (type-only circular import — erased at runtime).
 */
export function connectWebSocket(this: BaseWebSocketClient): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      this.state = 'connecting';
      this.emit('stateChange', { from: 'disconnected', to: 'connecting' });

      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        const now = Date.now();
        this.state = 'connected';
        this.stats.connectedAt = now;
        this.reconnectAttempts = 0;
        this.lastMessageTime = now;

        logger.info(`[WebSocket] Connected to ${this.config.url}`);
        this.emit('connected', { url: this.config.url, timestamp: now });

        this.startHeartbeat();
        resolve();
      };

      this.ws.onclose = (event) => {
        const now = Date.now();
        const prevState = this.state;
        this.state = 'disconnected';
        this.stats.disconnectedAt = now;
        this.stopHeartbeat();

        logger.info(`[WebSocket] Disconnected from ${this.config.url}`, {
          code: event.code,
          reason: event.reason,
        });

        this.emit('disconnected', {
          code: event.code,
          reason: event.reason,
          timestamp: now,
        });

        // Only reconnect if not manually disconnected
        if (prevState !== 'failed' && this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
          this.state = 'failed';
          this.emit('failed', {
            reason: 'Max reconnect attempts reached',
            attempts: this.reconnectAttempts,
          });
        }
      };

      this.ws.onerror = (error) => {
        logger.error(`[WebSocket] Error:`, { error });
        this.state = 'disconnected';
        this.emit('error', { error, timestamp: Date.now() });
        reject(error);
      };

      this.ws.onmessage = (event) => {
        const now = Date.now();
        this.lastMessageTime = now;
        this.pendingHeartbeat = false;
        this.stats.messageCount++;

        try {
          const data = JSON.parse(event.data as string);
          const message = this.handleMessage(data);

          if (message) {
            // Calculate latency if timestamp is provided
            if (this.config.latencyTracking && data.ts) {
              const latency = now - data.ts;
              this.recordLatency(latency);
              message.latency = latency;
            }

            this.messageHandlers.forEach((handler) => handler(message));
            this.emit('message', message);
          }
        } catch (parseError) {
          logger.error('[WebSocket] Failed to parse message:', { parseError });
          this.emit('error', { error: parseError, type: 'parse', timestamp: now });
        }
      };
    } catch (error) {
      this.state = 'disconnected';
      reject(error);
    }
  });
}

/**
 * Wait for connection with timeout. Stateful helper bound to a
 * BaseWebSocketClient via the `this` parameter (type-only circular import —
 * erased at runtime).
 */
export function waitForConnection(this: BaseWebSocketClient, timeout: number = 10000): Promise<boolean> {
  if (this.isConnected()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      this.removeListener('connected', onConnected);
      this.removeListener('failed', onFailed);
      resolve(false);
    }, timeout);

    const onConnected = () => {
      clearTimeout(timer);
      this.removeListener('failed', onFailed);
      resolve(true);
    };

    const onFailed = () => {
      clearTimeout(timer);
      this.removeListener('connected', onConnected);
      resolve(false);
    };

    this.once('connected', onConnected);
    this.once('failed', onFailed);
  });
}