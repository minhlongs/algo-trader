/**
 * Tier 1 Tests: F8 (Prometheus Metrics), F9 (HTTP Server), F10 (Zero Accounting Drift)
 */

import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { DeskMetricsRegistry, DaemonTestHarness, verifyZeroDrift } from './daemon-test-harness';

async function fetchHttp(port: number, path: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 500, body: data, headers: res.headers });
      });
    }).on('error', reject);
  });
}

export function registerTier1F8F10TelemetryTests(): void {
  describe('F8: Isolated Prometheus Metrics Exporter', () => {
    it('creates an isolated registry without polluting global registry', async () => {
      const reg1 = new DeskMetricsRegistry();
      const reg2 = new DeskMetricsRegistry();
      reg1.setEngineAllocatedCapital('arbitrage', 50000);
      const text1 = await reg1.getMetricsText();
      const text2 = await reg2.getMetricsText();
      expect(text1).toContain('desk_engine_allocated_capital_usd{engine="arbitrage"} 50000');
      expect(text2).not.toContain('desk_engine_allocated_capital_usd{engine="arbitrage"} 50000');
    });

    it('records queue depth and orders total counter across statuses', async () => {
      const reg = new DeskMetricsRegistry();
      reg.setPriorityQueueDepth(7);
      reg.incrementQueueShed('LOW', 3);
      reg.incrementQueueShed('HIGH', 1);
      const text = await reg.getMetricsText();
      expect(text).toContain('desk_priority_queue_depth 7');
      expect(text).toContain('desk_queue_shed_total{urgency="LOW"} 3');
      expect(text).toContain('desk_queue_shed_total{urgency="HIGH"} 1');
    });

    it('records orders fill rate and realized slippage', async () => {
      const reg = new DeskMetricsRegistry();
      reg.setOrdersFillRate(0.85);
      reg.setRealizedSlippageBps(4.2);
      const text = await reg.getMetricsText();
      expect(text).toContain('desk_orders_fill_rate 0.85');
      expect(text).toContain('desk_realized_slippage_bps 4.2');
    });

    it('records circuit breaker tier and realized slippage gauges', async () => {
      const reg = new DeskMetricsRegistry();
      reg.setCircuitBreakerTier('HALT');
      reg.setRealizedSlippageBps(4.2);
      const text = await reg.getMetricsText();
      expect(text).toContain('desk_circuit_breaker_tier{tier="HALT"} 1');
      expect(text).toContain('desk_circuit_breaker_tier{tier="NORMAL"} 0');
      expect(text).toContain('desk_realized_slippage_bps 4.2');
    });

    it('formats valid Prometheus text exposition standard 0.0.4', async () => {
      const reg = new DeskMetricsRegistry();
      reg.setAccountingDriftUsd(0.00001);
      const text = await reg.getMetricsText();
      expect(text).toContain('# HELP desk_accounting_drift_usd');
      expect(text).toContain('# TYPE desk_accounting_drift_usd gauge');
      expect(text).toContain('desk_accounting_drift_usd 0.00001');
      expect(text).toContain('desk_zero_drift_compliant 1');
    });
  });

  describe('F9: HTTP Status Server Endpoints', () => {
    it('GET /health returns HTTP 200 with status ok and uptime', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      const res = await fetchHttp(port, '/health');
      expect(res.status).toBe(200);
      const parsed = JSON.parse(res.body) as { status: string; uptimeSeconds: number };
      expect(parsed.status).toBe('ok');
      expect(parsed.uptimeSeconds).toBeGreaterThanOrEqual(0);
      await harness.cleanup();
    });

    it('GET /status returns HTTP 200 with live desk telemetry payload', async () => {
      const harness = new DaemonTestHarness({ mode: 'SHADOW', capitalUsd: 200000 });
      harness.state = 'RUNNING';
      const port = await harness.startServer(0);
      const res = await fetchHttp(port, '/status');
      expect(res.status).toBe(200);
      const parsed = JSON.parse(res.body) as { status: string; mode: string; navUsd: number };
      expect(parsed.status).toBe('RUNNING');
      expect(parsed.mode).toBe('SHADOW');
      expect(parsed.navUsd).toBe(200000);
      await harness.cleanup();
    });

    it('GET /api/desk/allocations returns capital allocation breakdown', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      const res = await fetchHttp(port, '/api/desk/allocations');
      expect(res.status).toBe(200);
      const parsed = JSON.parse(res.body) as { allocatedCapitalUsd: Record<string, number>; driftUsd: number };
      expect(parsed.allocatedCapitalUsd['arbitrage']).toBe(25000);
      expect(parsed.driftUsd).toBe(0);
      await harness.cleanup();
    });

    it('GET /metrics returns HTTP 200 with Prometheus text format', async () => {
      const harness = new DaemonTestHarness();
      harness.metrics.setPriorityQueueDepth(5);
      const port = await harness.startServer(0);
      const res = await fetchHttp(port, '/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('desk_priority_queue_depth 5');
      await harness.cleanup();
    });

    it('returns HTTP 404 for unknown endpoints', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      const res = await fetchHttp(port, '/nonexistent-route');
      expect(res.status).toBe(404);
      await harness.cleanup();
    });

    it('binds to ephemeral port 0 avoiding collisions and closes gracefully', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThanOrEqual(65535);
      await harness.cleanup();
      await expect(fetchHttp(port, '/health')).rejects.toThrow();
    });
  });

  describe('F10: Zero Accounting Drift Invariant Verification', () => {
    it('verifies exact balance matching when drift is zero', () => {
      const allocated = { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 };
      const res = verifyZeroDrift(100000, allocated, 0);
      expect(res.valid).toBe(true);
      expect(res.driftUsd).toBe(0);
    });

    it('passes verification when drift is within strict |delta| < 10^-4 tolerance', () => {
      const allocated = { arbitrage: 25000.00005, marl: 25000, amm: 25000, 'alpha-lab': 25000 };
      const res = verifyZeroDrift(100000, allocated, 0);
      expect(res.valid).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });

    it('fails verification when drift violates |delta| >= 10^-4 USD threshold', () => {
      const allocated = { arbitrage: 25000.0002, marl: 25000, amm: 25000, 'alpha-lab': 25000 };
      const res = verifyZeroDrift(100000, allocated, 0);
      expect(res.valid).toBe(false);
      expect(res.driftUsd).toBeGreaterThanOrEqual(1e-4);
    });

    it('verifies asymmetric capital allocations with positive unallocated cash buffer', () => {
      const allocated = { arbitrage: 40000, marl: 30000, amm: 15000, 'alpha-lab': 5000 };
      const unallocatedCash = 10000;
      const res = verifyZeroDrift(100000, allocated, unallocatedCash);
      expect(res.valid).toBe(true);
      expect(res.driftUsd).toBe(0);
    });

    it('detects negative discrepancy when NAV is under-allocated', () => {
      const allocated = { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 };
      const res = verifyZeroDrift(100000, allocated, 15000); // 5000 missing!
      expect(res.valid).toBe(false);
      expect(res.driftUsd).toBe(5000);
    });

    it('tolerates IEEE 754 floating point arithmetic precision noise', () => {
      const val = 0.1 + 0.2; // 0.30000000000000004
      const allocated = { arbitrage: 0.1, marl: 0.2, amm: 0, 'alpha-lab': 0 };
      const res = verifyZeroDrift(val, allocated, 0);
      expect(res.valid).toBe(true);
      expect(res.driftUsd).toBeLessThan(1e-4);
    });
  });
}
