import { describe, it, expect } from 'vitest';
import {
  GlobalCircuitBreaker,
  EngineSynchronizer,
} from '../fixtures/risk-contract.fixture';
import { MockEngineRiskAdapter } from '../fixtures/test-data.fixture';

export function registerTier2RiskBreakerTests(): void {
  describe('Tier 2: Boundary - Feature 9: 5-Tier Circuit Breaker (F9)', () => {
    it('B9.1: drawdown at exactly 5.000% transitions to ALERT tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(95000);
      expect(s.tier).toBe('ALERT');
    });

    it('B9.2: drawdown at exactly 10.000% transitions to REDUCE tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(90000);
      expect(s.tier).toBe('REDUCE');
    });

    it('B9.3: drawdown at exactly 15.000% transitions to HALT tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(85000);
      expect(s.tier).toBe('HALT');
    });

    it('B9.4: drawdown at exactly 20.000% transitions to HARD_STOP tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(80000);
      expect(s.tier).toBe('HARD_STOP');
    });

    it('B9.5: mean correlation at 0.85001 triggers ALERT tier even at 0% drawdown', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const s = cb.evaluate(100000, 0.851);
      expect(s.tier).toBe('ALERT');
      expect(s.reason).toContain('Correlation spike');
    });
  });

  describe('Tier 2: Boundary - Feature 10: Engine Synchronizer (F10)', () => {
    it('B10.1: timeout at exactly timeoutMs trips fail-closed emergency hard stop', async () => {
      const slow = new MockEngineRiskAdapter('arbitrage');
      slow.notifyCircuitBreaker = () => new Promise((resolve) => setTimeout(resolve, 80));
      const sync = new EngineSynchronizer([slow], 30);
      const res = await sync.broadcastBreaker({
        tier: 'ALERT',
        peakToTroughDrawdown: 0.05,
        meanCorrelation: 0.2,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'timeout test',
      });
      expect(res.success).toBe(false);
      expect(slow.isHardStopped).toBe(true);
    });

    it('B10.2: broadcast with 0 adapters succeeds immediately without error', async () => {
      const sync = new EngineSynchronizer([]);
      const res = await sync.broadcastBreaker({
        tier: 'NORMAL',
        peakToTroughDrawdown: 0,
        meanCorrelation: 0.1,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'empty test',
      });
      expect(res.success).toBe(true);
    });

    it('B10.3: single failing adapter triggers emergency hard stop on all adapters', async () => {
      const okAdapter = new MockEngineRiskAdapter('marl');
      const failAdapter = new MockEngineRiskAdapter('amm');
      failAdapter.notifyCircuitBreaker = async () => { throw new Error('Network crash'); };

      const sync = new EngineSynchronizer([okAdapter, failAdapter]);
      const res = await sync.broadcastBreaker({
        tier: 'ALERT',
        peakToTroughDrawdown: 0.05,
        meanCorrelation: 0.2,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'crash test',
      });
      expect(res.success).toBe(false);
      expect(okAdapter.isHardStopped).toBe(true);
    });

    it('B10.4: rapid consecutive broadcasts execute cleanly', async () => {
      const adapter = new MockEngineRiskAdapter('alpha-lab');
      const sync = new EngineSynchronizer([adapter]);
      await sync.broadcastBreaker({ tier: 'ALERT', peakToTroughDrawdown: 0.05, meanCorrelation: 0.2, grossLeverage: 1.0, triggeredAt: Date.now(), reason: '1' });
      await sync.broadcastBreaker({ tier: 'REDUCE', peakToTroughDrawdown: 0.10, meanCorrelation: 0.2, grossLeverage: 1.0, triggeredAt: Date.now(), reason: '2' });
      expect(adapter.receivedStates.length).toBe(2);
    });

    it('B10.5: reduction factor 0.50 is recorded properly during REDUCE tier', async () => {
      const adapter = new MockEngineRiskAdapter('arbitrage');
      const sync = new EngineSynchronizer([adapter]);
      await sync.broadcastBreaker({ tier: 'REDUCE', peakToTroughDrawdown: 0.10, meanCorrelation: 0.2, grossLeverage: 1.0, triggeredAt: Date.now(), reason: 'r' });
      expect(adapter.reductionFactors).toContain(0.50);
    });
  });
}
