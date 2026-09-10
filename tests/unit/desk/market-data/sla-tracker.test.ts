// SPDX-License-Identifier: MIT
/**
 * @vitest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlaTracker } from '../../../../src/desk/market-data/sla-tracker';
import { MarketDataSource } from '../../../../src/desk/market-data/types';

describe('SlaTracker', () => {
  let tracker: SlaTracker;

  beforeEach(() => {
    tracker = new SlaTracker({
      targetAvailability: 99.9,
      windows: [1, 24],
      enableMetrics: false, // Disable for tests
    });
  });

  describe('request recording', () => {
    it('should record successful requests', () => {
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 150);

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report).not.toBeNull();
      expect(report?.windows[1].totalRequests).toBe(1);
      expect(report?.windows[1].availability).toBe(100);
    });

    it('should record failed requests', () => {
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100);
      tracker.recordRequest(MarketDataSource.SANTIMENT, false, 200);
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 150);

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.windows[1].totalRequests).toBe(3);
      expect(report?.windows[1].failedRequests).toBe(1);
      expect(report?.windows[1].availability).toBeCloseTo(66.67, 1);
      expect(report?.windows[1].errorRate).toBeCloseTo(0.333, 3);
    });

    it('should calculate average latency', () => {
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100);
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 200);
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 300);

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.windows[1].avgLatency).toBe(200);
    });

    it('should handle multiple windows', () => {
      // Record requests for 1h window
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100);

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.windows[1]).toBeDefined();
      expect(report?.windows[24]).toBeDefined();
    });
  });

  describe('health score calculation', () => {
    it('should return high health score for good performance', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100 + Math.random() * 100);
      }

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.healthScore).toBeGreaterThan(80);
    });

    it('should return low health score for poor performance', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordRequest(MarketDataSource.SANTIMENT, i % 10 === 0, 2000); // High latency
      }

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.healthScore).toBeLessThan(80);
    });
  });

  describe('SLA target checking', () => {
    it('should meet SLA target with high availability', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100);
      }

      expect(tracker.meetsSlaTarget(MarketDataSource.SANTIMENT, 1)).toBe(true);
    });

    it('should not meet SLA target with low availability', () => {
      for (let i = 0; i < 100; i++) {
        tracker.recordRequest(MarketDataSource.SANTIMENT, i < 90, 100); // 90% availability
      }

      expect(tracker.meetsSlaTarget(MarketDataSource.SANTIMENT, 1)).toBe(false);
    });
  });

  describe('candle completeness tracking', () => {
    it('should track candle completeness', () => {
      tracker.recordCandleCompleteness(
        MarketDataSource.SANTIMENT,
        'BTC/USDT',
        '1h',
        100, // expected
        95   // received
      );

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.windows[1].completeness).toBeCloseTo(95, 1);
    });

    it('should handle zero expected candles', () => {
      tracker.recordCandleCompleteness(
        MarketDataSource.SANTIMENT,
        'BTC/USDT',
        '1h',
        0,
        0
      );

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.windows[1].completeness).toBe(100); // Default to 100%
    });
  });

  describe('reset and cleanup', () => {
    it('should reset provider state', () => {
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100);
      tracker.recordRequest(MarketDataSource.SANTIMENT, false, 200);

      tracker.reset(MarketDataSource.SANTIMENT);

      const report = tracker.getSlaReport(MarketDataSource.SANTIMENT);
      expect(report?.windows[1].totalRequests).toBe(0);
    });

    it('should return null for unknown provider', () => {
      const report = tracker.getSlaReport('UNKNOWN_PROVIDER' as any);
      expect(report).toBeNull();
    });
  });

  describe('getAllReports', () => {
    it('should return reports for all tracked providers', () => {
      tracker.recordRequest(MarketDataSource.SANTIMENT, true, 100);
      tracker.recordRequest(MarketDataSource.LUNARCRUSH, true, 150);

      const reports = tracker.getAllReports();
      expect(reports.length).toBe(2);
    });
  });

  // ── sla-tracker-state helpers — window rollover (line 51) ─────────────────

  describe('sla-tracker-state window rollover', () => {
    it('resets window counters when window age exceeds length (line 51)', async () => {
      const { ensureProvider, getOrCreateWindow } = await import('../../../../src/desk/market-data/sla-tracker-state');
      const { MarketDataSource } = await import('../../../../src/desk/market-data/types');
      const providerMetrics = new Map<unknown, unknown>();
      const provider = MarketDataSource.SANTIMENT;

      // Ensure provider map exists (line 13-19)
      ensureProvider(providerMetrics as never, provider);

      // Create window at T=0
      const t0 = Date.UTC(2026, 0, 1);
      const w1 = getOrCreateWindow(
        providerMetrics as never,
        provider,
        1,
        t0
      );
      expect(w1.totalRequests).toBe(0);

      // Advance 1ms past the 1h window length → triggers rollover
      const t1 = t0 + 60 * 60 * 1000 + 1;
      const w2 = getOrCreateWindow(
        providerMetrics as never,
        provider,
        1,
        t1
      );

      // Window rolled over: startTime reset, all counters zeroed
      expect(w2.startTime).toBe(t1);
      expect(w2.totalRequests).toBe(0);
      expect(w2.failedRequests).toBe(0);
      expect(w2.totalLatency).toBe(0);
      expect(w2.latencySamples).toEqual([]);
    });
  });
});

import { calculateHealthScore } from '../../../../src/desk/market-data/sla-tracker-scoring';
import type { SlaWindowReport } from '../../../../src/desk/market-data/sla-tracker-types';

function makeWindow(windowHours: number): SlaWindowReport {
  return {
    windowHours,
    availability: 100,
    errorRate: 0,
    avgLatency: 50,
    latencyPercentiles: { p50: 40, p95: 80, p99: 120 },
    completeness: 100,
    totalRequests: 10,
    failedRequests: 0,
  };
}

describe('calculateHealthScore', () => {
  it('returns 0 when called with an empty windows record (weightSum stays 0)', () => {
    expect(calculateHealthScore({})).toBe(0);
  });

  it('uses weight 0.5 for 72h window (windowHours <= 168 arm)', () => {
    const score = calculateHealthScore({ 72: makeWindow(72) });
    expect(score).toBeGreaterThan(0);
  });

  it('uses weight 0.2 for 720h window (windowHours > 168 arm)', () => {
    const score = calculateHealthScore({ 720: makeWindow(720) });
    expect(score).toBeGreaterThan(0);
  });
});
