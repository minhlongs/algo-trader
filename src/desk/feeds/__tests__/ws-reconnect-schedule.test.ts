/**
 * Tests for ws-reconnect scheduleReconnect — the stateful half of ws-reconnect.ts.
 *
 * Uses a minimal concrete BaseWebSocketClient whose `this` fields are driven
 * by the helper: state transition, attempt counting, reconnecting event, and
 * the timer firing connect().
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { scheduleReconnect } from '../ws-reconnect';
import type { BaseWebSocketClient } from '../websocket-client';
import type { WebSocketConfig, ConnectionStats, WebSocketState } from '../ws-types';

class FakeClient extends EventEmitter implements Partial<BaseWebSocketClient> {
  ws = null;
  config: WebSocketConfig = {
    url: 'wss://example.test/ws',
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    heartbeatInterval: 30000,
    reconnectMultiplier: 2,
    maxReconnectAttempts: 5,
    enableJitter: false,
    heartbeatTimeout: 10000,
    latencyTracking: false,
  };
  reconnectAttempts = 0;
  reconnectTimer: NodeJS.Timeout | null = null;
  state: WebSocketState = 'disconnected';
  stats = {
    reconnectCount: 0,
    messageCount: 0,
    heartbeatCount: 0,
    avgLatency: 0,
    minLatency: 0,
    maxLatency: 0,
    p95Latency: 0,
    latencySamples: [],
    uptime: 0,
  } as ConnectionStats;

  connect = vi.fn().mockResolvedValue(undefined);
  disconnect = vi.fn().mockResolvedValue(undefined);
  subscribe = vi.fn().mockResolvedValue(undefined);
  unsubscribe = vi.fn().mockResolvedValue(undefined);
  emit = vi.fn(EventEmitter.prototype.emit);
}

// scheduleReconnect is typed as a standalone `this`-bound helper; call it via
// Function.prototype.call on a FakeClient instance.
const schedule = scheduleReconnect as unknown as (this: FakeClient) => void;

describe('scheduleReconnect', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears an existing reconnect timer first', () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    const existingTimer = setTimeout(() => {}, 10000); // dummy handle
    client.reconnectTimer = existingTimer;
    const clearSpy = vi.spyOn(global, 'clearTimeout');

    schedule.call(client);

    expect(clearSpy).toHaveBeenCalledWith(existingTimer);
    clearTimeout(existingTimer); // clean up our dummy
  });

  it('transitions state to reconnecting and increments counters', () => {
    vi.useFakeTimers();
    const client = new FakeClient();

    schedule.call(client);

    expect(client.state).toBe('reconnecting');
    expect(client.stats.reconnectCount).toBe(1);
    expect(client.reconnectAttempts).toBe(1);
  });

  it('emits reconnecting event with attempt details', () => {
    vi.useFakeTimers();
    const client = new FakeClient();

    schedule.call(client);

    expect(client.emit).toHaveBeenCalledWith('reconnecting', {
      attempt: 1,
      maxAttempts: client.config.maxReconnectAttempts,
      delay: expect.any(Number),
    });
  });

  it('fires connect() after the computed delay', () => {
    vi.useFakeTimers();
    const client = new FakeClient();

    schedule.call(client); // delay = 1000ms (no jitter, 0 prior attempts)
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.reconnectTimer).not.toBeNull();

    vi.advanceTimersByTime(1000);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.reconnectTimer).toBeNull();
  });

  it('logs an error when the reconnect connect() rejects', async () => {
    vi.useFakeTimers();
    const client = new FakeClient();
    client.connect.mockRejectedValueOnce(new Error('boom'));

    schedule.call(client);
    vi.advanceTimersByTime(1000);

    // Give the rejected promise's catch handler a microtask to run
    await vi.waitFor(() => {
      expect(client.connect).toHaveBeenCalledTimes(1);
    });
  });

  it('uses exponential backoff across successive calls', () => {
    vi.useFakeTimers();
    const client = new FakeClient();

    schedule.call(client); // attempts 0 → delay 1000
    vi.advanceTimersByTime(1000);
    schedule.call(client); // attempts 1 → delay 2000
    expect(client.reconnectAttempts).toBe(2);
    expect(client.stats.reconnectCount).toBe(2);
  });
});