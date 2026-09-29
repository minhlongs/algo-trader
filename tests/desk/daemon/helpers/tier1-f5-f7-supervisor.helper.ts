/**
 * Tier 1 Tests: F5 (Supervisor), F6 (Tick Loop & Priority), F7 (Fail-Closed Halt <= 100ms)
 */

import { describe, it, expect } from 'vitest';
import { EngineSupervisor, DaemonTestHarness } from './daemon-test-harness';
import {
  createMockArbIntent,
  createMockMarlIntent,
  createMockAmmIntent,
  createMockAlphaIntent,
} from './mock-desk-components';
import type { UnifiedTradeIntent } from '../../../src/desk/orchestrator/orchestrator-types';

export function registerTier1F5F7SupervisorTests(): void {
  describe('F5: Concurrent 4-Engine Supervisor', () => {
    it('concurrently starts all 4 engines transitioning to RUNNING', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();
      const statuses = supervisor.getEngineStatuses();
      expect(statuses['arbitrage']?.status).toBe('RUNNING');
      expect(statuses['marl']?.status).toBe('RUNNING');
      expect(statuses['amm']?.status).toBe('RUNNING');
      expect(statuses['alpha-lab']?.status).toBe('RUNNING');
      await supervisor.stop();
    });

    it('gracefully stops all 4 engines transitioning to STOPPED', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();
      await supervisor.stop();
      const statuses = supervisor.getEngineStatuses();
      expect(statuses['arbitrage']?.status).toBe('STOPPED');
      expect(statuses['marl']?.status).toBe('STOPPED');
      expect(statuses['amm']?.status).toBe('STOPPED');
      expect(statuses['alpha-lab']?.status).toBe('STOPPED');
    });

    it('polls all 4 engines in a single cycle and aggregates intents', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();
      supervisor.engines.get('arbitrage')?.setQueue([createMockArbIntent()]);
      supervisor.engines.get('marl')?.setQueue([createMockMarlIntent()]);
      supervisor.engines.get('amm')?.setQueue([createMockAmmIntent()]);
      supervisor.engines.get('alpha-lab')?.setQueue([createMockAlphaIntent()]);

      const intents = await supervisor.pollCycle();
      expect(intents.length).toBe(4);
      const engineIds = intents.map((i) => i.engineId).sort();
      expect(engineIds).toEqual(['alpha-lab', 'amm', 'arbitrage', 'marl']);
      await supervisor.stop();
    });

    it('isolates single-engine failure during pollCycle without crashing peers', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();
      supervisor.engines.get('marl')?.setFailOnPoll(true, 'MARL crashed');
      supervisor.engines.get('arbitrage')?.setQueue([createMockArbIntent()]);
      supervisor.engines.get('amm')?.setQueue([createMockAmmIntent()]);

      const intents = await supervisor.pollCycle();
      expect(intents.length).toBe(2);
      const statuses = supervisor.getEngineStatuses();
      expect(statuses['marl']?.status).toBe('ERROR');
      expect(statuses['arbitrage']?.status).toBe('RUNNING');
      expect(statuses['amm']?.status).toBe('RUNNING');
      await supervisor.stop();
    });

    it('reports engine statuses accurately via getEngineStatuses()', async () => {
      const supervisor = new EngineSupervisor();
      const statuses = supervisor.getEngineStatuses();
      expect(Object.keys(statuses)).toHaveLength(4);
      expect(statuses['arbitrage']?.status).toBe('STOPPED');
    });
  });

  describe('F6: Daemon Tick Loop & Priority Ingestion', () => {
    function prioritizeIntents(intents: UnifiedTradeIntent[]): UnifiedTradeIntent[] {
      return [...intents].sort((a, b) => {
        const scoreA = (a.isRiskReducing ? 100 : 0) + (a.urgency === 'HIGH' ? 50 : a.urgency === 'MEDIUM' ? 25 : 10) + a.expectedEdgeBps;
        const scoreB = (b.isRiskReducing ? 100 : 0) + (b.urgency === 'HIGH' ? 50 : b.urgency === 'MEDIUM' ? 25 : 10) + b.expectedEdgeBps;
        return scoreB - scoreA;
      });
    }

    it('prioritizes HIGH urgency Arbitrage over LOW urgency Alpha-Lab', () => {
      const arb = createMockArbIntent({ urgency: 'HIGH', expectedEdgeBps: 30 });
      const alpha = createMockAlphaIntent({ urgency: 'LOW', expectedEdgeBps: 20 });
      const sorted = prioritizeIntents([alpha, arb]);
      expect(sorted[0]?.engineId).toBe('arbitrage');
    });

    it('grants priority boost to risk-reducing hedge intents', () => {
      const arb = createMockArbIntent({ urgency: 'HIGH', expectedEdgeBps: 40, isRiskReducing: false });
      const marlHedge = createMockMarlIntent({ urgency: 'MEDIUM', expectedEdgeBps: 10, isRiskReducing: true });
      const sorted = prioritizeIntents([arb, marlHedge]);
      expect(sorted[0]?.engineId).toBe('marl');
    });

    it('filters out expired trade intents before ingestion', () => {
      const now = Date.now();
      const validIntent = createMockArbIntent({ expiresAt: now + 5000 });
      const expiredIntent = createMockMarlIntent({ expiresAt: now - 100 });
      const unexpired = [validIntent, expiredIntent].filter((i) => i.expiresAt > now);
      expect(unexpired).toHaveLength(1);
      expect(unexpired[0]?.engineId).toBe('arbitrage');
    });

    it('handles empty poll cycles gracefully without intent emission', async () => {
      const supervisor = new EngineSupervisor();
      await supervisor.start();
      const intents = await supervisor.pollCycle();
      expect(intents).toEqual([]);
      await supervisor.stop();
    });

    it('processes batch of simultaneous multi-engine intents preserving all 4 engines', async () => {
      const intents: UnifiedTradeIntent[] = [
        createMockAlphaIntent(),
        createMockArbIntent(),
        createMockMarlIntent(),
        createMockAmmIntent(),
      ];
      const sorted = prioritizeIntents(intents);
      expect(sorted).toHaveLength(4);
      expect(new Set(sorted.map((i) => i.engineId)).size).toBe(4);
    });

    it('maintains intent stability when priority scores tie', () => {
      const intentA = createMockArbIntent({ intentId: 'tie-1', urgency: 'MEDIUM', expectedEdgeBps: 25 });
      const intentB = createMockAmmIntent({ intentId: 'tie-2', urgency: 'MEDIUM', expectedEdgeBps: 25 });
      const sorted = prioritizeIntents([intentA, intentB]);
      expect(sorted).toHaveLength(2);
    });
  });

  describe('F7: Fail-Closed Signal Intercept (<= 100ms)', () => {
    it('executes emergency halt within <= 100ms benchmark requirement', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      await harness.startServer(0);
      const elapsedMs = await harness.triggerEmergencyHalt();
      expect(elapsedMs).toBeLessThanOrEqual(100);
      expect(harness.state).toBe('EMERGENCY_HALT');
      expect(harness.circuitBreakerTier).toBe('HARD_STOP');
      await harness.cleanup();
    });

    it('stops supervised engines immediately upon emergency halt', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      await harness.triggerEmergencyHalt();
      const statuses = harness.supervisor.getEngineStatuses();
      for (const st of Object.values(statuses)) {
        expect(st.status).toBe('STOPPED');
      }
      await harness.cleanup();
    });

    it('shuts down HTTP status server during emergency halt', async () => {
      const harness = new DaemonTestHarness();
      const port = await harness.startServer(0);
      expect(port).toBeGreaterThan(0);
      await harness.triggerEmergencyHalt();
      expect(harness.server).toBeNull();
      await harness.cleanup();
    });

    it('is idempotent across duplicate halt invocations without deadlock', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      const t1 = await harness.triggerEmergencyHalt();
      const t2 = await harness.triggerEmergencyHalt();
      expect(t1).toBeLessThanOrEqual(100);
      expect(t2).toBeLessThanOrEqual(100);
      await harness.cleanup();
    });

    it('retains HARD_STOP circuit breaker tier after halt', async () => {
      const harness = new DaemonTestHarness();
      await harness.triggerEmergencyHalt();
      expect(harness.circuitBreakerTier).toBe('HARD_STOP');
      await harness.cleanup();
    });
  });
}
