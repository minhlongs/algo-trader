/**
 * Tests for in-memory metrics collector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getMetricsCollector,
  recordRequest,
  getMetrics,
  getPrometheusMetrics,
  trackConnection,
} from '../metrics-collector';

describe('MetricsCollector', () => {
  beforeEach(() => {
    // Reset singleton for each test
    const collector = getMetricsCollector();
    // Access private field for testing - create fresh collector
    (collector as Record<string, unknown>).requests = [];
    (collector as Record<string, unknown>).activeConnections = 0;
    (collector as Record<string, unknown>).startTime = Date.now();
  });

  describe('recordRequest', () => {
    it('records request metrics', () => {
      recordRequest('GET', '/api/health', 200, 25);

      const metrics = getMetrics();
      expect(metrics.requests.total).toBe(1);
      expect(metrics.requests.perStatus['200']).toBe(1);
      expect(metrics.requests.perMethod['GET']).toBe(1);
    });

    it('normalizes method to uppercase', () => {
      recordRequest('get', '/api/test', 200, 10);
      recordRequest('Post', '/api/test', 201, 20);

      const metrics = getMetrics();
      expect(metrics.requests.perMethod['GET']).toBe(1);
      expect(metrics.requests.perMethod['POST']).toBe(1);
    });

    it('tracks multiple status codes', () => {
      recordRequest('GET', '/api/test', 200, 10);
      recordRequest('GET', '/api/test', 404, 15);
      recordRequest('GET', '/api/test', 500, 100);

      const metrics = getMetrics();
      expect(metrics.requests.perStatus['200']).toBe(1);
      expect(metrics.requests.perStatus['404']).toBe(1);
      expect(metrics.requests.perStatus['500']).toBe(1);
    });
  });

  describe('latency calculations', () => {
    it('calculates percentiles correctly', () => {
      // Record 100 requests with latencies 1-100ms
      for (let i = 1; i <= 100; i++) {
        recordRequest('GET', '/api/test', 200, i);
      }

      const metrics = getMetrics();
      expect(metrics.latency.min).toBe(1);
      expect(metrics.latency.max).toBe(100);
      expect(metrics.latency.p50).toBe(50);
      expect(metrics.latency.p95).toBe(95);
      expect(metrics.latency.p99).toBe(99);
    });

    it('handles empty metrics', () => {
      const metrics = getMetrics();
      expect(metrics.latency.p50).toBe(0);
      expect(metrics.latency.p95).toBe(0);
      expect(metrics.latency.p99).toBe(0);
      expect(metrics.latency.avg).toBe(0);
    });
  });

  describe('error tracking', () => {
    it('calculates error rate correctly', () => {
      for (let i = 0; i < 10; i++) {
        recordRequest('GET', '/api/test', 200, 10);
      }
      recordRequest('GET', '/api/test', 500, 100);

      const metrics = getMetrics();
      expect(metrics.errors.total).toBe(1);
      expect(metrics.errors.rate).toBeCloseTo(0.0909, 3);
    });
  });

  describe('sliding window', () => {
    it('evicts records older than 5 minutes', () => {
      const collector = getMetricsCollector();

      // Manually add old record (6 minutes ago)
      const oldRecord = {
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        durationMs: 10,
        timestamp: Date.now() - 6 * 60 * 1000,
      };
      (collector as Record<string, unknown>).requests = [oldRecord];

      // Add new record
      recordRequest('GET', '/api/test', 200, 20);

      const metrics = getMetrics();
      expect(metrics.requests.total).toBe(1);
    });
  });

  describe('active connections', () => {
    it('tracks connection lifecycle', () => {
      const tracker = trackConnection();
      expect(getMetrics().activeConnections).toBe(1);

      tracker.end();
      expect(getMetrics().activeConnections).toBe(0);
    });

    it('handles multiple concurrent connections', () => {
      const tracker1 = trackConnection();
      const tracker2 = trackConnection();

      expect(getMetrics().activeConnections).toBe(2);

      tracker1.end();
      expect(getMetrics().activeConnections).toBe(1);

      tracker2.end();
      expect(getMetrics().activeConnections).toBe(0);
    });

    it('prevents negative active connections', () => {
      const tracker = trackConnection();
      tracker.end();
      tracker.end(); // Extra end call

      expect(getMetrics().activeConnections).toBe(0);
    });
  });

  describe('Prometheus metrics', () => {
    it('generates valid Prometheus format', () => {
      recordRequest('GET', '/api/test', 200, 50);

      const prometheus = getPrometheusMetrics();
      expect(prometheus).toContain('# HELP algo_trader_requests_total');
      expect(prometheus).toContain('# TYPE algo_trader_requests_total counter');
      expect(prometheus).toContain('algo_trader_requests_total 1');
      expect(prometheus).toContain('algo_trader_latency_ms{quantile="0.5"}');
    });
  });
});
