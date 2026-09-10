/**
 * Tests for ws-latency-stats — computeLatencyStats (pure) and
 * recordLatency (bound via `this` to a BaseWebSocketClient-like object).
 */
import { describe, it, expect, vi } from 'vitest';
import { computeLatencyStats, recordLatency } from '../ws-latency-stats';
import type { BaseWebSocketClient } from '../websocket-client';

describe('computeLatencyStats', () => {
  it('returns zeros for an empty sample array', () => {
    expect(computeLatencyStats([])).toEqual({ avgLatency: 0, minLatency: 0, maxLatency: 0, p95Latency: 0 });
  });

  it('computes avg/min/max for a single sample', () => {
    expect(computeLatencyStats([42])).toEqual({ avgLatency: 42, minLatency: 42, maxLatency: 42, p95Latency: 42 });
  });

  it('computes avg/min/max/p95 for unsorted samples', () => {
    const r = computeLatencyStats([100, 20, 50, 80, 10]);
    // avg = 260/5 = 52; sorted = [10,20,50,80,100]; p95 index = floor(5*.95)=4 -> 100
    expect(r).toEqual({ avgLatency: 52, minLatency: 10, maxLatency: 100, p95Latency: 100 });
  });

  it('uses a p95 index within bounds for large arrays', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    // p95 index = floor(100*0.95) = 95 -> value 96
    expect(computeLatencyStats(samples).p95Latency).toBe(96);
  });
});

describe('recordLatency', () => {
  function makeClient(overrides: Record<string, unknown> = {}) {
    return {
      config: { latencyTracking: true },
      stats: {
        latencySamples: [] as number[],
        lastLatency: 0,
        minLatency: Infinity,
        maxLatency: 0,
        messageCount: 0,
      },
      recalculateLatencyStats: vi.fn(),
      ...overrides,
    } as unknown as BaseWebSocketClient;
  }

  it('is a no-op when latencyTracking is disabled', () => {
    const client = makeClient({ config: { latencyTracking: false } });
    recordLatency.call(client, 50);
    const stats = (client as unknown as { stats: { latencySamples: number[] } }).stats;
    expect(stats.latencySamples).toEqual([]);
  });

  it('records the sample and updates last/min/max', () => {
    const client = makeClient();
    recordLatency.call(client, 50);
    recordLatency.call(client, 30);
    const stats = (client as unknown as { stats: { latencySamples: number[]; lastLatency: number; minLatency: number; maxLatency: number } }).stats;
    expect(stats.latencySamples).toEqual([50, 30]);
    expect(stats.lastLatency).toBe(30);
    expect(stats.minLatency).toBe(30);
    expect(stats.maxLatency).toBe(50);
  });

  it('shifts the oldest sample once 1000 are buffered', () => {
    const client = makeClient();
    const stats = (client as unknown as { stats: { latencySamples: number[] } }).stats;
    for (let i = 0; i < 1000; i++) stats.latencySamples.push(i);
    recordLatency.call(client, 9999);
    expect(stats.latencySamples).toHaveLength(1000);
    expect(stats.latencySamples[0]).toBe(1); // oldest (0) was shifted out
    expect(stats.latencySamples[999]).toBe(9999);
  });

  it('recalculates stats every 100 messages', () => {
    const client = makeClient({ stats: { latencySamples: [], lastLatency: 0, minLatency: Infinity, maxLatency: 0, messageCount: 0 } });
    recordLatency.call(client, 1);
    expect((client as unknown as { recalculateLatencyStats: ReturnType<typeof vi.fn> }).recalculateLatencyStats).toHaveBeenCalledTimes(1);
    (client as unknown as { stats: { messageCount: number } }).stats.messageCount = 1;
    recordLatency.call(client, 2);
    expect((client as unknown as { recalculateLatencyStats: ReturnType<typeof vi.fn> }).recalculateLatencyStats).toHaveBeenCalledTimes(1);
    (client as unknown as { stats: { messageCount: number } }).stats.messageCount = 100;
    recordLatency.call(client, 3);
    expect((client as unknown as { recalculateLatencyStats: ReturnType<typeof vi.fn> }).recalculateLatencyStats).toHaveBeenCalledTimes(2);
  });
});
