import { describe, it, expect } from 'vitest';
import {
  CapitalBufferGuard,
  RollingCovarianceEstimator,
} from '../../../../src/desk/portfolio';
import {
  computeVarCvar,
  computeTailDivergence,
  GlobalCircuitBreaker,
  EngineSynchronizer,
} from '../fixtures/risk-contract.fixture';
import {
  AccountingReconciler,
  TelemetryEventBus,
  EodRiskLedger,
} from '../fixtures/telemetry-contract.fixture';
import { MockEngineRiskAdapter } from '../fixtures/test-data.fixture';

export function registerTier5AdversarialChaosTests(): void {
  describe('Tier 5: Adversarial Hardening - Chaos & Byzantine Faults (ADV-11 to ADV-20)', () => {
    it('ADV-11: Cauchy heavy-tail jump distribution flags tail divergence (> 1.5x)', () => {
      // 100 observations: 95 typical market days + 5 severe negative jump days
      const cauchyReturns: number[] = new Array(95).fill(0.0005);
      cauchyReturns.push(-0.15, -0.20, -0.25, -0.30, -0.35);

      const varRes = computeVarCvar(cauchyReturns, 100000, 0.95, 1);
      const divergence = computeTailDivergence(varRes.parametricCVaR, varRes.historicalCVaR, 1.5);
      expect(divergence.ratio).toBeGreaterThan(1.5);
      expect(divergence.isTailDivergent).toBe(true);
    });

    it('ADV-12: Rapid high-frequency correlation flip (+1.0 to -1.0) maintains finite variance', () => {
      const est = new RollingCovarianceEstimator({ windowSize: 10 });
      for (let i = 0; i < 10; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        est.addObservation({ arbitrage: 0.1 * sign, marl: -0.1 * sign, amm: 0.05, 'alpha-lab': 0.05 });
      }
      const cov = est.getCovarianceMatrix();
      expect(Number.isFinite(cov.matrix[0][0])).toBe(true);
      expect(cov.matrix[0][0]).toBeGreaterThan(0);
    });

    it('ADV-13: Byzantine engine adapter hanging indefinitely trips fail-closed hard stop', async () => {
      const normalAdapter = new MockEngineRiskAdapter('arbitrage');
      const hangingAdapter = new MockEngineRiskAdapter('marl');
      hangingAdapter.notifyCircuitBreaker = () => new Promise((resolve) => setTimeout(resolve, 10000)); // hangs 10s

      const sync = new EngineSynchronizer([normalAdapter, hangingAdapter], 40); // 40ms timeout
      const res = await sync.broadcastBreaker({
        tier: 'ALERT',
        peakToTroughDrawdown: 0.05,
        meanCorrelation: 0.3,
        grossLeverage: 1.0,
        triggeredAt: Date.now(),
        reason: 'Byzantine hang test',
      });

      expect(res.success).toBe(false);
      expect(normalAdapter.isHardStopped).toBe(true);
      expect(hangingAdapter.isHardStopped).toBe(true);
    });

    it('ADV-14: Maliciously tampered ledger record is detected at exact index', () => {
      const ledger = new EodRiskLedger('secret-salt-xyz');
      for (let i = 0; i < 5; i++) {
        ledger.appendSnapshot(100000 + i * 1000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      }
      // Corrupt record 4
      const rec4 = (ledger as unknown as { records: { totalNavUsd: number }[] }).records[3];
      rec4.totalNavUsd = 9999999;

      const integrity = ledger.verifyChainIntegrity();
      expect(integrity.isValid).toBe(false);
      expect(integrity.corruptedIndex).toBe(3);
    });

    it('ADV-15: Prepending rogue block to cryptographic ledger breaks genesis check', () => {
      const ledger = new EodRiskLedger('secret-salt-xyz');
      ledger.appendSnapshot(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      // Alter genesis prevHash
      const rec1 = (ledger as unknown as { records: { prevHash: string }[] }).records[0];
      rec1.prevHash = 'ROGUE_FORK_HASH_000000000000000000000000000000000000000000000000000';

      const integrity = ledger.verifyChainIntegrity();
      expect(integrity.isValid).toBe(false);
      expect(integrity.corruptedIndex).toBe(0);
    });

    it('ADV-16: Extreme floating point drift stress (1,000 sub-cent additions)', () => {
      let accumPnl = 0;
      for (let i = 0; i < 1000; i++) {
        accumPnl += 0.0001; // 0.1 cent
      }
      const initialEquity = 100000;
      const totalEquity = initialEquity + accumPnl;
      const res = AccountingReconciler.verifyZeroDrift(
        totalEquity,
        20000,
        { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
        { arbitrage: accumPnl, marl: 0, amm: 0, 'alpha-lab': 0 },
        1e-4
      );
      expect(res.isZeroDrift).toBe(true);
    });

    it('ADV-17: Complete portfolio NAV wipeout ($0.00) handled safely by buffer guard', () => {
      const guard = new CapitalBufferGuard();
      const res = guard.applyGuard(0, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(res.unallocatedCashUsd).toBe(0);
      expect(res.cashBufferRatio).toBe(1.0);
    });

    it('ADV-18: 100% capital locked in active positions flags drain mode across all engines', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const res = guard.applyGuard(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 } // $100k locked > $80k deployable
      );
      expect(res.drainModeEngines.length).toBe(4);
    });

    it('ADV-19: High-concurrency event bus flooding (1,000 rapid emissions)', () => {
      const bus = new TelemetryEventBus();
      for (let i = 0; i < 1000; i++) {
        bus.emit(`desk.telemetry.burst.${i % 10}`, { seq: i });
      }
      expect(bus.getEvents().length).toBe(1000);
      expect(bus.getEvents('desk.telemetry.burst.0').length).toBe(100);
    });

    it('ADV-20: Simultaneous drawdown, correlation spike, and tail divergence executes unified emergency halt', async () => {
      const cb = new GlobalCircuitBreaker(100000);
      // Simultaneous 18% drawdown + 0.95 correlation
      const state = cb.evaluate(82000, 0.95);
      expect(state.tier).toBe('HALT');

      const adapter = new MockEngineRiskAdapter('alpha-lab');
      const sync = new EngineSynchronizer([adapter]);
      await sync.broadcastBreaker(state);
      expect(adapter.isHalted).toBe(true);
    });
  });
}
