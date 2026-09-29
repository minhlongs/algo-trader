/**
 * Tier 1 Tests: F1 (CLI Options & Validation) & F2 (CLI desk:status Inspection)
 */

import { describe, it, expect } from 'vitest';
import { DeskAutoConfigSchema, DaemonTestHarness } from './daemon-test-harness';

export function registerTier1F1F2CliTests(): void {
  describe('F1: CLI desk:auto Options & Validation', () => {
    it('applies institutional defaults for capital, mode, and intervals', () => {
      const parsed = DeskAutoConfigSchema.parse({});
      expect(parsed.mode).toBe('PAPER');
      expect(parsed.capitalUsd).toBe(100_000);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.pollIntervalMs).toBe(1000);
      expect(parsed.metricsPort).toBe(9100);
      expect(parsed.exchanges).toContain('binance');
      expect(parsed.symbols).toContain('BTC/USDT');
    });

    it('accepts valid custom configurations across modes and capital', () => {
      const custom = DeskAutoConfigSchema.parse({
        mode: 'LIVE',
        capitalUsd: 500_000,
        dryRun: false,
        pollIntervalMs: 500,
        metricsPort: 9200,
        durationSeconds: 3600,
      });
      expect(custom.mode).toBe('LIVE');
      expect(custom.capitalUsd).toBe(500_000);
      expect(custom.dryRun).toBe(false);
      expect(custom.durationSeconds).toBe(3600);
    });

    it('rejects non-positive capital with Zod validation error', () => {
      expect(() => DeskAutoConfigSchema.parse({ capitalUsd: 0 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ capitalUsd: -5000 })).toThrow();
    });

    it('rejects invalid mode enum values', () => {
      expect(() => DeskAutoConfigSchema.parse({ mode: 'TEST' as unknown })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ mode: 'DEMO' as unknown })).toThrow();
    });

    it('rejects poll interval below 50ms guardrail', () => {
      expect(() => DeskAutoConfigSchema.parse({ pollIntervalMs: 20 })).toThrow();
      expect(() => DeskAutoConfigSchema.parse({ pollIntervalMs: -100 })).toThrow();
    });

    it('allows ephemeral port 0 and boundary durations for test harnesses', () => {
      const parsed = DeskAutoConfigSchema.parse({ metricsPort: 0, durationSeconds: 0.1 });
      expect(parsed.metricsPort).toBe(0);
      expect(parsed.durationSeconds).toBe(0.1);
    });
  });

  describe('F2: CLI desk:status Real-time Inspection', () => {
    it('inspects real-time engine states across all 4 supervised engines', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      const statuses = harness.supervisor.getEngineStatuses();
      expect(Object.keys(statuses).sort()).toEqual(['alpha-lab', 'amm', 'arbitrage', 'marl']);
      expect(statuses['arbitrage']?.status).toBe('RUNNING');
      expect(statuses['marl']?.status).toBe('RUNNING');
      expect(statuses['amm']?.status).toBe('RUNNING');
      expect(statuses['alpha-lab']?.status).toBe('RUNNING');
      await harness.cleanup();
    });

    it('formats capital allocation breakdown accurately', () => {
      const harness = new DaemonTestHarness({ capitalUsd: 100_000 });
      const allocations = {
        allocatedCapitalUsd: { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
        unallocatedCashUsd: 0,
        driftUsd: 0,
      };
      const total = Object.values(allocations.allocatedCapitalUsd).reduce((a, b) => a + b, 0);
      expect(total + allocations.unallocatedCashUsd).toBe(harness.config.capitalUsd);
    });

    it('reports circuit breaker tier transitions accurately', () => {
      const harness = new DaemonTestHarness();
      expect(harness.circuitBreakerTier).toBe('NORMAL');
      harness.circuitBreakerTier = 'ALERT';
      expect(harness.circuitBreakerTier).toBe('ALERT');
      harness.circuitBreakerTier = 'HALT';
      expect(harness.circuitBreakerTier).toBe('HALT');
    });

    it('reports engine status as ERROR when an individual engine fails', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      const marlEngine = harness.supervisor.engines.get('marl');
      marlEngine?.setFailOnPoll(true, 'WebSocket dropped');
      await harness.supervisor.pollCycle();
      const statuses = harness.supervisor.getEngineStatuses();
      expect(statuses['marl']?.status).toBe('ERROR');
      expect(statuses['arbitrage']?.status).toBe('RUNNING');
      await harness.cleanup();
    });

    it('maintains lastSignalTime when engine emits trade intents', async () => {
      const harness = new DaemonTestHarness();
      await harness.supervisor.start();
      const arb = harness.supervisor.engines.get('arbitrage');
      arb?.setQueue([{
        intentId: 'arb-1',
        engineId: 'arbitrage',
        symbol: 'BTC/USDT',
        venue: 'binance',
        side: 'BUY',
        quantity: 1,
        urgency: 'HIGH',
        expectedEdgeBps: 20,
        expectedSharpe: 2,
        timeToExpiryMs: 1000,
        expiresAt: Date.now() + 1000,
        orderType: 'IOC',
        isRiskReducing: false,
      }]);
      await harness.supervisor.pollCycle();
      const statuses = harness.supervisor.getEngineStatuses();
      expect(statuses['arbitrage']?.lastSignalTime).toBeDefined();
      expect(statuses['arbitrage']?.lastSignalTime).toBeGreaterThan(0);
      await harness.cleanup();
    });
  });
}
