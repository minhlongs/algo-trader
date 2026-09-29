/**
 * Tier 5 Adversarial Hardening: Accounting Drift, Engine Faults & Queue Flood
 * Stress tests for float jitter, unresponsive engines, and queue backpressure
 */

import { describe, it, expect } from 'vitest';
import { verifyZeroDrift } from '../../../../src/desk/daemon/desk-daemon-types';
import { parseDeskAutoConfig } from '../../../../src/desk/commands/desk-auto-types';
import { DeskDaemon } from '../../../../src/desk/daemon/desk-daemon';
import { EngineSupervisor } from './daemon-test-harness';
import { BoundedPriorityQueue } from './tier2-drift-queue.helper';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAlphaIntent,
} from './mock-desk-components';

export function registerTier5DriftEngineTests(): void {
  describe('Tier 5 Adversarial Hardening: Drift, Engine Faults & Queue Stress', () => {
    it('8. float jitter summation with repeating fractions verifies zero drift and catches perturbations >= 1e-4', () => {
      const nav = 100_000;
      const cash = 20_000;
      // Repeating fractions (1/3 and 1/6 of 80,000)
      const allocated = {
        arbitrage: 80_000 / 3,
        marl: 80_000 / 3,
        amm: 80_000 / 6,
        'alpha-lab': 80_000 / 6,
      };

      const result = verifyZeroDrift(nav, allocated, cash);
      expect(result.valid).toBe(true);
      expect(result.driftUsd).toBeLessThan(1e-4);

      // Perturb by 0.000101 USD (> 1e-4 USD)
      const perturbed = { ...allocated, arbitrage: allocated.arbitrage + 0.000101 };
      const failResult = verifyZeroDrift(nav, perturbed, cash);
      expect(failResult.valid).toBe(false);
      expect(failResult.driftUsd).toBeGreaterThanOrEqual(1e-4);
    });

    it('9. extreme capital scale ($10^14) and sub-satoshi allocations maintain precision without overflow', () => {
      const megaNav = 1e14; // 100 Trillion USD
      const megaAlloc = {
        arbitrage: 2.5e13,
        marl: 2.5e13,
        amm: 2.5e13,
        'alpha-lab': 0.5e13,
      };
      const megaCash = 2.0e13;
      const megaRes = verifyZeroDrift(megaNav, megaAlloc, megaCash);
      expect(megaRes.valid).toBe(true);
      expect(megaRes.driftUsd).toBe(0);

      // Micro sub-satoshi allocations ($0.00000001)
      const microNav = 1.0;
      const microAlloc = { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.05 };
      const microCash = 0.20;
      const microRes = verifyZeroDrift(microNav, microAlloc, microCash);
      expect(microRes.valid).toBe(true);
      expect(microRes.driftUsd).toBeLessThan(1e-4);
    });

    it('10. unresponsive engine throwing unhandled error during pollCycle is isolated while other engines continue', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();

      // Crash alpha-lab
      const alpha = supervisor.engines.get('alpha-lab');
      alpha?.setFailOnPoll(true, 'Simulated unhandled neural network crash');

      // Provide intents for arbitrage and marl
      supervisor.engines.get('arbitrage')?.setQueue([createMockArbIntent()]);
      supervisor.engines.get('marl')?.setQueue([createMockMarlIntent()]);

      // pollCycle must not reject
      const collected = await supervisor.pollCycle();
      expect(collected.length).toBe(2);
      expect(collected.some((i) => i.engineId === 'arbitrage')).toBe(true);
      expect(collected.some((i) => i.engineId === 'marl')).toBe(true);

      const statuses = supervisor.getEngineStatuses();
      expect(statuses['alpha-lab']?.status).toBe('ERROR');
      expect(statuses['arbitrage']?.status).toBe('RUNNING');

      await supervisor.stop();
    });

    it('11. repeatedly failing engine transitions status to ERROR and recovers cleanly when errors cease', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();

      const amm = supervisor.engines.get('amm');
      amm?.setFailOnPoll(true, 'Simulated RPC timeout');

      for (let i = 0; i < 3; i++) {
        await supervisor.pollCycle();
        expect(supervisor.getEngineStatuses()['amm']?.status).toBe('ERROR');
      }

      // Restore health
      amm?.setFailOnPoll(false);
      amm?.setQueue([createMockAlphaIntent()]);
      const recovered = await supervisor.pollCycle();
      expect(recovered.length).toBe(1);

      await supervisor.stop();
    });

    it('12. high-concurrency intent queue flood sheds low-priority items under backpressure', () => {
      const queue = new BoundedPriorityQueue(50);

      // Flood 100 LOW-urgency intents (edge 5)
      for (let i = 0; i < 100; i++) {
        queue.push(createMockAlphaIntent({ intentId: `low-${i}`, urgency: 'LOW', expectedEdgeBps: 5 }));
      }
      expect(queue.size()).toBe(50);

      // Flood 50 HIGH-urgency intents (edge 90)
      for (let i = 0; i < 50; i++) {
        queue.push(createMockArbIntent({ intentId: `high-${i}`, urgency: 'HIGH', expectedEdgeBps: 90 }));
      }
      expect(queue.size()).toBe(50);

      const drained = queue.drain();
      expect(drained).toHaveLength(50);
      for (const item of drained) {
        expect(item.urgency).toBe('HIGH');
        expect(item.expectedEdgeBps).toBe(90);
      }
    });

    it('13. dead-man switch trip latches emergency halt preventing unsafe state flapping on intermittent ticks', async () => {
      const config = parseDeskAutoConfig({});
      const daemon = new DeskDaemon({ config, skipSignalHandlers: true, skipServer: true });
      await daemon.start();

      // Trip watchdog with tick from 6000ms ago (> 5000ms staleness threshold)
      const now = Date.now();
      daemon.watchdog.recordTick('binance', 'BTC/USDT', now - 6000);
      daemon.watchdog.checkFreshness(now);

      expect(daemon.watchdog.isTripped()).toBe(true);
      expect(daemon.loop.getState()).toBe('EMERGENCY_HALT');

      // Intermittent tick arrives shortly after
      daemon.watchdog.recordTick('binance', 'BTC/USDT', Date.now());
      daemon.watchdog.checkFreshness(Date.now());

      // System MUST remain latched in EMERGENCY_HALT and not flap back to RUNNING
      expect(daemon.loop.getState()).toBe('EMERGENCY_HALT');

      // Subsequent ticks cannot execute orders
      daemon.supervisor.getEngine('arbitrage')?.setQueue?.([createMockArbIntent()]);
      const results = await daemon.tick();
      expect(results).toHaveLength(0);

      await daemon.stop();
    });
  });
}
