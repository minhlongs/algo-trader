import { describe, it, expect } from 'vitest';
import {
  GlobalCircuitBreaker,
  EngineSynchronizer,
} from '../fixtures/risk-contract.fixture';
import { MockEngineRiskAdapter } from '../fixtures/test-data.fixture';

export function registerTier1RiskBreakerTests(): void {
  describe('Feature 9: 5-Tier Circuit Breaker (F9)', () => {
    it('F9.1: remains in NORMAL tier during low drawdown (< 5%)', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(98000);
      expect(s.tier).toBe('NORMAL');
    });

    it('F9.2: transitions to ALERT tier upon 5% drawdown or high correlation (> 0.85)', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(94000);
      expect(s.tier).toBe('ALERT');
      expect(s.peakToTroughDrawdown).toBeCloseTo(0.06, 2);
    });

    it('F9.3: transitions to REDUCE tier upon 10% drawdown', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(89000);
      expect(s.tier).toBe('REDUCE');
    });

    it('F9.4: transitions to HALT tier upon 15% drawdown', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(84000);
      expect(s.tier).toBe('HALT');
    });

    it('F9.5: transitions to HARD_STOP terminal tier upon 20% drawdown breach', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(79000);
      expect(s.tier).toBe('HARD_STOP');
      expect(s.reason).toContain('Terminal drawdown breach');
    });
  });

  describe('Feature 10: Engine Synchronizer (F10)', () => {
    it('F10.1: synchronously broadcasts circuit breaker state to all 4 engine adapters', async () => {
      const adapters = [new MockEngineRiskAdapter('arbitrage'), new MockEngineRiskAdapter('marl'), new MockEngineRiskAdapter('amm'), new MockEngineRiskAdapter('alpha-lab')];
      const synchronizer = new EngineSynchronizer(adapters);
      const res = await synchronizer.broadcastBreaker({
        tier: 'ALERT',
        peakToTroughDrawdown: 0.06,
        meanCorrelation: 0.3,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'Alert test',
      });
      expect(res.success).toBe(true);
      adapters.forEach((a) => expect(a.receivedStates.length).toBe(1));
    });

    it('F10.2: triggers reducePositions(0.50) across all engines during REDUCE tier', async () => {
      const adapters = [new MockEngineRiskAdapter('arbitrage'), new MockEngineRiskAdapter('marl')];
      const synchronizer = new EngineSynchronizer(adapters);
      await synchronizer.broadcastBreaker({
        tier: 'REDUCE',
        peakToTroughDrawdown: 0.11,
        meanCorrelation: 0.4,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'Reduce test',
      });
      adapters.forEach((a) => expect(a.reductionFactors).toContain(0.50));
    });

    it('F10.3: triggers haltTrading() across all engines during HALT tier', async () => {
      const adapters = [new MockEngineRiskAdapter('amm'), new MockEngineRiskAdapter('alpha-lab')];
      const synchronizer = new EngineSynchronizer(adapters);
      await synchronizer.broadcastBreaker({
        tier: 'HALT',
        peakToTroughDrawdown: 0.16,
        meanCorrelation: 0.5,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'Halt test',
      });
      adapters.forEach((a) => expect(a.isHalted).toBe(true));
    });

    it('F10.4: triggers emergencyHardStop() across all engines during HARD_STOP tier', async () => {
      const adapters = [new MockEngineRiskAdapter('arbitrage')];
      const synchronizer = new EngineSynchronizer(adapters);
      await synchronizer.broadcastBreaker({
        tier: 'HARD_STOP',
        peakToTroughDrawdown: 0.22,
        meanCorrelation: 0.5,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'Hard stop',
      });
      expect(adapters[0].isHardStopped).toBe(true);
    });

    it('F10.5: enforces fail-closed behavior on timeout or communication failure', async () => {
      const slowAdapter: MockEngineRiskAdapter = new MockEngineRiskAdapter('marl');
      slowAdapter.notifyCircuitBreaker = () => new Promise((resolve) => setTimeout(resolve, 200));
      const synchronizer = new EngineSynchronizer([slowAdapter], 50);
      const res = await synchronizer.broadcastBreaker({
        tier: 'ALERT',
        peakToTroughDrawdown: 0.05,
        meanCorrelation: 0.3,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'Slow test',
      });
      expect(res.success).toBe(false);
      expect(slowAdapter.isHardStopped).toBe(true);
    });
  });
}
