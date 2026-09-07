/**
 * shard-metrics — Unit Tests
 *
 * Covers src/durable-objects/shard-metrics.ts:
 * - getMemoryInfo: performance.memory present (rss/heapUsed), absent (0/0),
 *   performance undefined (0/0)
 * - computeAvgLatency: requests>0 (division), requests=0 (0)
 * - formatMetricsResponse: shardId spread, avgLatencyMs computed, overrides
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getMemoryInfoMock } = vi.hoisted(() => ({
  getMemoryInfo: vi.fn(),
}));

// We do NOT mock the module under test — we test the real functions. We only
// control the global `performance` object to exercise both branches of
// getMemoryInfo. The shard-fetch-handlers test mocks this module; this file
// tests it directly.

import { getMemoryInfo, computeAvgLatency, formatMetricsResponse } from '../shard-metrics';
import type { ShardMetrics } from '../strategy-shard-types';

const baseMetrics: ShardMetrics = {
  requests: 0,
  totalLatencyMs: 0,
  errors: 0,
  queueLength: 5,
  strategiesLoaded: 3,
  lastUpdated: 0,
};

describe('getMemoryInfo', () => {
  let originalPerformance: unknown;

  beforeEach(() => {
    originalPerformance = (globalThis as Record<string, unknown>).performance;
  });

  afterEach(() => {
    if (originalPerformance === undefined) {
      delete (globalThis as Record<string, unknown>).performance;
    } else {
      (globalThis as Record<string, unknown>).performance = originalPerformance;
    }
  });

  it('returns 0/0 when performance is undefined', () => {
    delete (globalThis as Record<string, unknown>).performance;
    const result = getMemoryInfo();
    expect(result).toEqual({ rss: 0, heapUsed: 0 });
  });

  it('returns 0/0 when performance exists but has no memory property', () => {
    (globalThis as Record<string, unknown>).performance = { now: () => 0 };
    const result = getMemoryInfo();
    expect(result).toEqual({ rss: 0, heapUsed: 0 });
  });

  it('returns rss/heapUsed when performance.memory is present', () => {
    (globalThis as Record<string, unknown>).performance = {
      memory: { rss: 1024, usedJSHeapSize: 512 },
    };
    const result = getMemoryInfo();
    expect(result).toEqual({ rss: 1024, heapUsed: 512 });
  });

  it('returns undefined rss/heapUsed when memory values are missing', () => {
    (globalThis as Record<string, unknown>).performance = { memory: {} };
    const result = getMemoryInfo();
    expect(result).toEqual({ rss: undefined, heapUsed: undefined });
  });
});

describe('computeAvgLatency', () => {
  it('returns 0 when requests is 0', () => {
    expect(computeAvgLatency({ ...baseMetrics, requests: 0, totalLatencyMs: 100 })).toBe(0);
  });

  it('returns 0 when both requests and totalLatencyMs are 0', () => {
    expect(computeAvgLatency({ ...baseMetrics, requests: 0, totalLatencyMs: 0 })).toBe(0);
  });

  it('returns totalLatencyMs / requests when requests > 0', () => {
    expect(computeAvgLatency({ ...baseMetrics, requests: 4, totalLatencyMs: 100 })).toBe(25);
  });

  it('handles fractional result', () => {
    expect(computeAvgLatency({ ...baseMetrics, requests: 3, totalLatencyMs: 100 })).toBeCloseTo(33.333, 3);
  });

  it('handles large values', () => {
    expect(computeAvgLatency({ ...baseMetrics, requests: 1000, totalLatencyMs: 5000 })).toBe(5);
  });
});

describe('formatMetricsResponse', () => {
  it('includes shardId and spreads metrics', () => {
    const result = formatMetricsResponse(2, { ...baseMetrics, requests: 10, totalLatencyMs: 100 });
    expect(result.shardId).toBe(2);
    expect(result.requests).toBe(10);
    expect(result.totalLatencyMs).toBe(100);
    expect(result.errors).toBe(0);
    expect(result.queueLength).toBe(5);
    expect(result.strategiesLoaded).toBe(3);
    expect(result.lastUpdated).toBe(0);
  });

  it('computes avgLatencyMs from metrics', () => {
    const result = formatMetricsResponse(1, { ...baseMetrics, requests: 4, totalLatencyMs: 80 });
    expect(result.avgLatencyMs).toBe(20);
  });

  it('computes avgLatencyMs as 0 when requests is 0', () => {
    const result = formatMetricsResponse(1, { ...baseMetrics, requests: 0, totalLatencyMs: 0 });
    expect(result.avgLatencyMs).toBe(0);
  });

  it('does not mutate the input metrics object', () => {
    const input = { ...baseMetrics, requests: 5, totalLatencyMs: 25 };
    const before = JSON.parse(JSON.stringify(input));
    formatMetricsResponse(3, input);
    expect(input).toEqual(before);
  });

  it('returns a new object each call', () => {
    const a = formatMetricsResponse(1, baseMetrics);
    const b = formatMetricsResponse(1, baseMetrics);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('preserves all metric fields including errors and queueLength', () => {
    const result = formatMetricsResponse(7, {
      requests: 100,
      totalLatencyMs: 5000,
      errors: 3,
      queueLength: 12,
      strategiesLoaded: 8,
      lastUpdated: 1700000000000,
    });
    expect(result.errors).toBe(3);
    expect(result.queueLength).toBe(12);
    expect(result.strategiesLoaded).toBe(8);
    expect(result.lastUpdated).toBe(1700000000000);
    expect(result.avgLatencyMs).toBe(50);
  });
});