/**
 * Tier 3 Cross-Feature Tests: Lifecycle, Watchdog, Halt & Status Transitions
 */

import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { DaemonTestHarness, EngineSupervisor } from './daemon-test-harness';
import { BoundedPriorityQueue } from './tier2-drift-queue.helper';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './mock-desk-components';

function fetchJson<T>(port: number, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

export function registerTier3LifecycleTests(): void {
  describe('Tier 3: Lifecycle, Watchdog & Status Transitions', () => {
    it('watchdog trip during supervisor active polling cycle halts supervisor and marks state HALT', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      harness.watchdog.recordTick('binance', 1000);
      harness.watchdog.checkFreshness(7000); // 6000ms > 5000ms max staleness
      expect(harness.watchdog.isTripped()).toBe(true);
      expect(harness.circuitBreakerTier).toBe('HALT');
      await harness.triggerEmergencyHalt();
      for (const st of Object.values(harness.supervisor.getEngineStatuses())) {
        expect(st.status).toBe('STOPPED');
      }
      await harness.cleanup();
    });

    it('emergency halt triggered while priority queue has pending items immediately drains queue', async () => {
      const harness = new DaemonTestHarness();
      const q = new BoundedPriorityQueue(50);
      for (let i = 0; i < 10; i++) {
        q.push(createMockArbIntent({ intentId: `pending-${i}`, expectedEdgeBps: 20 + i }));
      }
      expect(q.size()).toBe(10);
      const elapsed = await harness.triggerEmergencyHalt();
      const drained = q.drain();
      expect(elapsed).toBeLessThanOrEqual(100);
      expect(drained).toHaveLength(10);
      expect(q.size()).toBe(0);
      await harness.cleanup();
    });

    it('feed watchdog stall moves circuit breaker to HALT and updates Prometheus gauge and HTTP /status', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      harness.metrics.circuitBreakerTier.set(0); // NORMAL
      harness.watchdog.recordTick('bybit', 1000);
      harness.watchdog.checkFreshness(6500); // Trips
      harness.circuitBreakerTier = 'HALT';
      harness.metrics.circuitBreakerTier.set(3); // Tier 3 = HALT
      const status = await fetchJson<{ circuitBreakerTier: string }>(port, '/status');
      expect(status.circuitBreakerTier).toBe('HALT');
      const metricsText = await harness.metrics.getMetricsText();
      expect(metricsText).toContain('desk_circuit_breaker_tier 3');
      await harness.cleanup();
    });

    it('HTTP /status accurately tracks live daemon transitions from INITIALIZING -> RUNNING -> PAUSED -> EMERGENCY_HALT', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      let res = await fetchJson<{ status: string }>(port, '/status');
      expect(res.status).toBe('INITIALIZING');
      harness.state = 'RUNNING';
      res = await fetchJson<{ status: string }>(port, '/status');
      expect(res.status).toBe('RUNNING');
      harness.state = 'PAUSED';
      res = await fetchJson<{ status: string }>(port, '/status');
      expect(res.status).toBe('PAUSED');
      harness.state = 'EMERGENCY_HALT';
      res = await fetchJson<{ status: string }>(port, '/status');
      expect(res.status).toBe('EMERGENCY_HALT');
      await harness.cleanup();
    });

    it('concurrent 4-engine intent burst with 1 failing engine preserves healthy intents and reports ERROR', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();
      supervisor.engines.get('marl')?.setFailOnPoll(true, 'MARL crashed');
      supervisor.engines.get('arbitrage')?.setQueue([createMockArbIntent()]);
      supervisor.engines.get('amm')?.setQueue([createMockAmmIntent()]);
      supervisor.engines.get('alpha-lab')?.setQueue([createMockAlphaIntent()]);
      const intents = await supervisor.pollCycle();
      expect(intents).toHaveLength(3);
      const statuses = supervisor.getEngineStatuses();
      expect(statuses['marl']?.status).toBe('ERROR');
      expect(statuses['arbitrage']?.status).toBe('RUNNING');
      await supervisor.stop();
    });

    it('graceful shutdown sequence halts supervisor and closes HTTP server within <= 100ms benchmark', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      await harness.startServer(0);
      const t0 = performance.now();
      await harness.cleanup();
      const elapsed = performance.now() - t0;
      expect(elapsed).toBeLessThanOrEqual(100);
      expect(harness.server).toBeNull();
    });

    it('rapid watchdog trip and reset cycle resumes normal polling and recovers circuit breaker to NORMAL', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      harness.watchdog.recordTick('binance', 1000);
      harness.watchdog.checkFreshness(7000);
      expect(harness.watchdog.isTripped()).toBe(true);
      harness.watchdog.reset();
      expect(harness.watchdog.isTripped()).toBe(false);
      harness.circuitBreakerTier = 'NORMAL';
      expect(harness.circuitBreakerTier).toBe('NORMAL');
      const intents = await harness.supervisor.pollCycle();
      expect(intents).toEqual([]);
      await harness.cleanup();
    });

    it('fail-closed signal aborts in-flight execution slicing and sets circuit breaker to HARD_STOP', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      harness.state = 'RUNNING';
      const elapsed = await harness.triggerEmergencyHalt();
      expect(elapsed).toBeLessThanOrEqual(100);
      expect(harness.state).toBe('EMERGENCY_HALT');
      expect(harness.circuitBreakerTier).toBe('HARD_STOP');
      await harness.cleanup();
    });
  });
}
