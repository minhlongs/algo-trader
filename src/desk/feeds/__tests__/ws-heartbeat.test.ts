/**
 * Tests for ws-heartbeat — start/stop/handle-response cycle over a stub
 * BaseWebSocketClient. Fake timers drive the interval and the timeout window;
 * logger is mocked. The client methods the helpers call (stopHeartbeat,
 * sendHeartbeat, emit, forceReconnect) are spies so virtual dispatch and the
 * timeout path are observable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { startHeartbeat, stopHeartbeat, handleHeartbeatResponse } from '../ws-heartbeat';
import type { BaseWebSocketClient } from '../websocket-client';
import { logger } from '../../../shared/utils/logger';

interface FakeClient {
  config: { heartbeatInterval: number; heartbeatTimeout: number };
  stats: { heartbeatCount: number };
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null;
  pendingHeartbeat: boolean;
  stopHeartbeat: ReturnType<typeof vi.fn>;
  sendHeartbeat: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  forceReconnect: ReturnType<typeof vi.fn>;
}

function makeClient(intervalMs = 1000, timeoutMs = 500): FakeClient {
  return {
    config: { heartbeatInterval: intervalMs, heartbeatTimeout: timeoutMs },
    stats: { heartbeatCount: 0 },
    heartbeatTimer: null,
    heartbeatTimeoutTimer: null,
    pendingHeartbeat: false,
    stopHeartbeat: vi.fn(),
    sendHeartbeat: vi.fn(),
    emit: vi.fn(),
    forceReconnect: vi.fn(),
  };
}

describe('ws-heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startHeartbeat', () => {
    it('clears any prior cycle before starting', () => {
      const client = makeClient();

      startHeartbeat.call(client as unknown as BaseWebSocketClient);

      expect(client.stopHeartbeat).toHaveBeenCalledOnce();
    });

    it('sends a heartbeat and arms the timeout after one interval', () => {
      const client = makeClient(1000, 500);

      startHeartbeat.call(client as unknown as BaseWebSocketClient);
      vi.advanceTimersByTime(1000);

      expect(client.sendHeartbeat).toHaveBeenCalledOnce();
      expect(client.pendingHeartbeat).toBe(true);
      // Timeout not yet elapsed — no reconnect.
      expect(client.forceReconnect).not.toHaveBeenCalled();
    });

    it('forces reconnect when the heartbeat response never arrives', () => {
      const client = makeClient(1000, 500);

      startHeartbeat.call(client as unknown as BaseWebSocketClient);
      vi.advanceTimersByTime(1000 + 500);

      expect(logger.warn).toHaveBeenCalledWith('[WebSocket] Heartbeat timeout - connection may be stale');
      expect(client.emit).toHaveBeenCalledWith('heartbeatTimeout', expect.objectContaining({ timestamp: expect.any(Number) }));
      expect(client.forceReconnect).toHaveBeenCalledWith('Heartbeat timeout');
    });

    it('does not force reconnect when the response arrived in time', () => {
      const client = makeClient(1000, 500);

      startHeartbeat.call(client as unknown as BaseWebSocketClient);
      vi.advanceTimersByTime(1000);
      client.pendingHeartbeat = false; // response arrived
      vi.advanceTimersByTime(500);

      expect(client.forceReconnect).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('keeps beating on each subsequent interval', () => {
      const client = makeClient(1000, 500);

      startHeartbeat.call(client as unknown as BaseWebSocketClient);
      vi.advanceTimersByTime(3000);

      expect(client.sendHeartbeat).toHaveBeenCalledTimes(3);
    });
  });

  describe('stopHeartbeat', () => {
    it('clears both timers and resets the pending flag', () => {
      const client = makeClient(1000, 500);
      startHeartbeat.call(client as unknown as BaseWebSocketClient);
      vi.advanceTimersByTime(1000); // interval fired → timeout timer armed
      expect(client.heartbeatTimer).not.toBeNull();
      expect(client.heartbeatTimeoutTimer).not.toBeNull();
      expect(client.pendingHeartbeat).toBe(true);

      stopHeartbeat.call(client as unknown as BaseWebSocketClient);

      expect(client.heartbeatTimer).toBeNull();
      expect(client.heartbeatTimeoutTimer).toBeNull();
      expect(client.pendingHeartbeat).toBe(false);
      // Timers truly cleared: nothing fires after the window passes.
      vi.advanceTimersByTime(5000);
      expect(client.sendHeartbeat).toHaveBeenCalledOnce(); // only the pre-stop beat
      expect(client.forceReconnect).not.toHaveBeenCalled();
    });

    it('is a no-op when no cycle was started', () => {
      const client = makeClient();

      expect(() => stopHeartbeat.call(client as unknown as BaseWebSocketClient)).not.toThrow();
      expect(client.pendingHeartbeat).toBe(false);
    });
  });

  describe('handleHeartbeatResponse', () => {
    it('clears the pending flag, counts the beat, and disarms the timeout', () => {
      const client = makeClient(1000, 500);
      startHeartbeat.call(client as unknown as BaseWebSocketClient);
      vi.advanceTimersByTime(1000);
      expect(client.heartbeatTimeoutTimer).not.toBeNull();

      handleHeartbeatResponse.call(client as unknown as BaseWebSocketClient);

      expect(client.pendingHeartbeat).toBe(false);
      expect(client.stats.heartbeatCount).toBe(1);
      expect(client.heartbeatTimeoutTimer).toBeNull();
      // Timeout window passes with no consequence.
      vi.advanceTimersByTime(500);
      expect(client.forceReconnect).not.toHaveBeenCalled();
    });

    it('counts multiple responses', () => {
      const client = makeClient();

      handleHeartbeatResponse.call(client as unknown as BaseWebSocketClient);
      handleHeartbeatResponse.call(client as unknown as BaseWebSocketClient);

      expect(client.stats.heartbeatCount).toBe(2);
    });
  });
});
