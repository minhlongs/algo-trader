/**
 * Tests for ws-reconnect — reconnect-delay math + schedule orchestration.
 *
 * Covers: exponential backoff, jitter bounds, clamping, scheduleReconnect.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeReconnectDelay, scheduleReconnect } from '../ws-reconnect';
import type { BaseWebSocketClient } from '../websocket-client';
import type { WebSocketConfig } from '../ws-types';

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
  const spy = vi.spyOn(Math, 'random');

  afterEach(() => spy.mockReset());

  it('stays at base when jitter coefficient is 0', () => {
    spy.mockReturnValue(0.5); // (0.5 * 2 - 1) = 0 → jitter = 0
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 1000 };
    expect(computeReconnectDelay(0, cfg)).toBe(1000);
  });

  it('jitter can be negative (−20% floor)', () => {
    spy.mockReturnValue(0); // (0 * 2 - 1) = -1 → jitter = -0.2 * delay
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 1000 };
    expect(computeReconnectDelay(0, cfg)).toBe(800);
  });

  it('jitter can be positive (+20% ceiling)', () => {
    spy.mockReturnValue(1); // (1 * 2 - 1) = 1 → jitter = +0.2 * delay
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 1000 };
    expect(computeReconnectDelay(0, cfg)).toBe(1200);
  });

  it('clamps negative jitter result to 0', () => {
    const cfg = { ...baseConfig, enableJitter: true, reconnectDelay: 10, maxReconnectDelay: 10 };
    spy.mockReturnValue(0); // delay=10, jitter=-2 → 8
    expect(computeReconnectDelay(0, cfg)).toBe(8);
  });
});

// ── scheduleReconnect (lines 38-67) ─────────────────────────────────────────

/**
 * Build a minimal mock BaseWebSocketClient for scheduleReconnect tests.
 * scheduleReconnect is a free function bound via `this`, so we pass a mock object.
 */
function createMockClient(overrides?: Partial<BaseWebSocketClient>): BaseWebSocketClient {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
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
    emit: vi.fn((event: string, ...args: any[]) => {
      (listeners[event] || []).forEach((fn) => fn(...args));
      return true;
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, fn: (...args: any[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return undefined as any;
    }),
    ...overrides,
  } as unknown as BaseWebSocketClient;
}

function clientStats() {
  return {
    reconnectCount: 0,
    messageCount: 0,
    heartbeatCount: 0,
    avgLatency: 0,
    minLatency: 0,
    maxLatency: 0,
    p95Latency: 0,
    latencySamples: [] as number[],
    uptime: 0,
  };
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
    global.clearTimeout = mockClear as any;
    const client = createMockClient({ reconnectTimer: 123 as unknown as ReturnType<typeof setTimeout> });

    scheduleReconnect.call(client);

    expect(mockClear).toHaveBeenCalledWith(123);
    global.clearTimeout = origClearTimeout;
  });

  it('sets state to reconnecting (line 43)', () => {
    const client = createMockClient();
    scheduleReconnect.call(client);
    expect(client.state).toBe('reconnecting');
  });

  it('increments stats.reconnectCount (line 44)', () => {
    const client = createMockClient({ stats: { ...clientStats(), reconnectCount: 3 } });
    scheduleReconnect.call(client);
    expect(client.stats.reconnectCount).toBe(4);
  });

  it('increments reconnectAttempts (line 48)', () => {
    const client = createMockClient({ reconnectAttempts: 2 });
    scheduleReconnect.call(client);
    expect(client.reconnectAttempts).toBe(3);
  });

  it('emits reconnecting event with attempt/maxAttempts/delay (line 55)', () => {
    const client = createMockClient();
    scheduleReconnect.call(client);
    expect(client.emit).toHaveBeenCalledWith('reconnecting', {
      attempt: 1,
      maxAttempts: 5,
      delay: 1000,
    });
  });

  it('schedules connect via setTimeout (lines 61-66)', () => {
    const client = createMockClient();
    scheduleReconnect.call(client);
    expect(client.connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('clears reconnectTimer after connect resolves (line 62)', async () => {
    const client = createMockClient();
    scheduleReconnect.call(client);
    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.reconnectTimer).toBeNull();
  });

  it('logs error when connect rejects (line 64)', async () => {
    const client = createMockClient({
      connect: vi.fn().mockRejectedValue(new Error('boom')),
    });
    scheduleReconnect.call(client);
    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });
});