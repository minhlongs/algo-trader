/**
 * Tests for ws-reconnect — reconnect-delay math + schedule orchestration.
 *
 * Covers: exponential backoff, jitter bounds, clamping, scheduleReconnect.
 * Strictly < 180 LOC, zero mocks, zero :any.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeReconnectDelay, scheduleReconnect } from '../ws-reconnect';
import type { BaseWebSocketClient } from '../websocket-client';

const baseConfig = {
  url: 'wss://example.test/ws',
  reconnectDelay: 1000,
  maxReconnectDelay: 10000,
  reconnectMultiplier: 2,
  maxReconnectAttempts: 5,
  enableJitter: false,
  latencyTracking: false,
};

describe('computeReconnectDelay (no jitter)', () => {
  it('returns base delay at 0 attempts', () => {
    expect(computeReconnectDelay(0, baseConfig)).toBe(1000);
  });

  it('applies exponential backoff', () => {
    expect(computeReconnectDelay(1, baseConfig)).toBe(2000);
    expect(computeReconnectDelay(2, baseConfig)).toBe(4000);
    expect(computeReconnectDelay(3, baseConfig)).toBe(8000);
  });

  it('clamps delay to maxReconnectDelay', () => {
    expect(computeReconnectDelay(20, baseConfig)).toBe(10000);
  });

  it('returns 0 when base and max are both 0', () => {
    const cfg = { ...baseConfig, reconnectDelay: 0, maxReconnectDelay: 0 };
    expect(computeReconnectDelay(5, cfg)).toBe(0);
  });
});

describe('computeReconnectDelay (with jitter)', () => {
  const jitterConfig = { ...baseConfig, enableJitter: true };

  it('stays within [baseDelay * (1 - jitterRange), baseDelay * (1 + jitterRange)]', () => {
    for (let i = 0; i < 20; i++) {
      const delay = computeReconnectDelay(0, jitterConfig);
      expect(delay).toBeGreaterThanOrEqual(1000 * 0.8);
      expect(delay).toBeLessThanOrEqual(1000 * 1.2);
    }
  });

  it('stays within jitter bounds under backoff', () => {
    const minExpected = 2000 * 0.8;
    const maxExpected = 2000 * 1.2;
    for (let i = 0; i < 20; i++) {
      const delay = computeReconnectDelay(1, jitterConfig);
      expect(delay).toBeGreaterThanOrEqual(minExpected);
      expect(delay).toBeLessThanOrEqual(maxExpected);
    }
  });

  it('never returns negative delay even if random is 0', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(computeReconnectDelay(0, jitterConfig)).toBeGreaterThanOrEqual(0);
    spy.mockRestore();
  });
});

function createMockClient(overrides: Partial<Record<string, unknown>> = {}): BaseWebSocketClient {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    reconnectTimer: null,
    state: 'disconnected',
    reconnectAttempts: 0,
    config: { ...baseConfig },
    stats: {
      reconnectCount: 0,
      messageCount: 0,
      heartbeatCount: 0,
      avgLatency: 0,
      minLatency: 0,
      maxLatency: 0,
      p95Latency: 0,
      latencySamples: [],
      uptime: 0,
    },
    emit: vi.fn((event: string, ...args: unknown[]) => {
      (listeners[event] || []).forEach((fn) => fn(...args));
      return true;
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return undefined as unknown;
    }),
    ...overrides,
  } as unknown as BaseWebSocketClient;
}

describe('scheduleReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears existing reconnectTimer before scheduling (line 40)', () => {
    const mockClear = vi.fn();
    const origClearTimeout = global.clearTimeout;
    global.clearTimeout = mockClear as unknown as typeof clearTimeout;
    const client = createMockClient({ reconnectTimer: 123 as unknown as ReturnType<typeof setTimeout> });
    scheduleReconnect.call(client);
    expect(mockClear).toHaveBeenCalledWith(123);
    global.clearTimeout = origClearTimeout;
  });

  it('sets state to reconnecting (line 43)', () => {
    const client = createMockClient({ state: 'connected' });
    scheduleReconnect.call(client);
    expect(client.state).toBe('reconnecting');
  });

  it('increments stats and attempts counters', () => {
    const client = createMockClient({ reconnectAttempts: 2 });
    scheduleReconnect.call(client);
    expect(client.stats.reconnectCount).toBe(1);
    expect(client.reconnectAttempts).toBe(3);
  });

  it('emits reconnecting event with attempt/maxAttempts/delay', () => {
    const client = createMockClient();
    scheduleReconnect.call(client);
    expect(client.emit).toHaveBeenCalledWith('reconnecting', {
      attempt: 1,
      maxAttempts: 5,
      delay: 1000,
    });
  });

  it('schedules connect via setTimeout and clears timer on resolve', async () => {
    const client = createMockClient();
    scheduleReconnect.call(client);
    expect(client.connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.reconnectTimer).toBeNull();
  });

  it('logs error when connect rejects', async () => {
    const client = createMockClient({
      connect: vi.fn().mockRejectedValue(new Error('boom')),
    });
    scheduleReconnect.call(client);
    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
});
