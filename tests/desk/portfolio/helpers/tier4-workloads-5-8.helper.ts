import { describe, it, expect } from 'vitest';
import {
  CapitalBufferGuard,
  PortfolioAllocator,
} from '../../../../src/desk/portfolio';
import {
  computeVarCvar,
  computeTailDivergence,
  LeverageExposureGuard,
} from '../fixtures/risk-contract.fixture';
import {
  AccountingReconciler,
  RoceCalculator,
  EodRiskLedger,
} from '../fixtures/telemetry-contract.fixture';
import { createShockEngineReturns } from '../fixtures/test-data.fixture';

export function registerTier4Workloads5To8(): void {
  describe('Tier 4: Real-World Workloads (Scenarios 5 - 8)', () => {
    it('Scenario 5: Zero Accounting Drift Multi-Engine Trading Session', () => {
      const initialEquity = 150000;
      const unallocatedCash = 30000; // 20%
      const initialCapitals = { arbitrage: 30000, marl: 30000, amm: 30000, 'alpha-lab': 30000 };
      const simulatedPnls = { arbitrage: 1250.50, marl: -800.25, amm: 420.75, 'alpha-lab': 2129.00 };

      const totalPnl = Object.values(simulatedPnls).reduce((a, b) => a + b, 0);
      const updatedEquity = initialEquity + totalPnl;

      const reconcileResult = AccountingReconciler.verifyZeroDrift(
        updatedEquity,
        unallocatedCash,
        initialCapitals,
        simulatedPnls,
        1e-4
      );

      expect(reconcileResult.isZeroDrift).toBe(true);
      expect(reconcileResult.driftUsd).toBeLessThan(1e-4);

      // Verify ROCE over 30-day session
      const capitalEmployed = 120000;
      const roce = RoceCalculator.computeRoce(totalPnl, capitalEmployed, 30);
      expect(roce.roce).toBeGreaterThan(0);
      expect(roce.roceAnnualized).toBeGreaterThan(0.20);
    });

    it('Scenario 6: Non-Gaussian Jump Risk & Divergence Alarm Throttles Leverage', () => {
      const shockObservations = createShockEngineReturns();
      const returns = shockObservations.map((obs) => (obs.arbitrage + obs.marl + obs.amm + obs['alpha-lab']) / 4);

      const varResult = computeVarCvar(returns, 100000, 0.95, 1);
      const divergence = computeTailDivergence(varResult.parametricCVaR, varResult.historicalCVaR, 1.5);

      expect(divergence.ratio).toBeGreaterThan(1.2);

      // Leverage guard throttles allowed gross leverage upon tail divergence
      const maxLeverage = divergence.isTailDivergent ? 1.5 : 3.0;
      const guard = new LeverageExposureGuard(maxLeverage);
      const testPositions = { btc: 80000, eth: 80000 }; // 1.6x leverage
      const check = guard.checkExposure(100000, testPositions);
      if (divergence.isTailDivergent) {
        expect(check.isAllowed).toBe(false);
      } else {
        expect(check.isAllowed).toBe(true);
      }
    });

    it('Scenario 7: Capital Starvation Lock & Rebalance Protection Under Alpha Surge', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const totalNavUsd = 200000;
      // High-expectancy active positions locked in alpha-lab ($70k) and arbitrage ($30k)
      const lockedCapital = { arbitrage: 30000, marl: 0, amm: 0, 'alpha-lab': 70000 };
      // Target rebalancing weights attempting to equalize risk (25% each)
      const targetWeights = { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 };

      const res = guard.applyGuard(totalNavUsd, targetWeights, lockedCapital);

      // Invariant 1: alpha-lab active positions not starved
      expect(res.allocatedCapitalUsd['alpha-lab']).toBeGreaterThanOrEqual(70000);
      // Invariant 2: arbitrage active positions preserved
      expect(res.allocatedCapitalUsd.arbitrage).toBeGreaterThanOrEqual(30000);
      // Invariant 3: liquid cash buffer preserved
      expect(res.cashBufferRatio).toBeGreaterThanOrEqual(0.20);
      expect(res.unallocatedCashUsd).toBeGreaterThanOrEqual(40000);
      expect(res.drainModeEngines).toContain('alpha-lab');
    });

    it('Scenario 8: Automated EOD Cryptographic Ledger & Run-Card Archival', () => {
      const ledger = new EodRiskLedger('audit-hmac-secret-key-2026');

      // Append day 1 snapshot
      const snap1 = ledger.appendSnapshot(
        100000,
        { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 },
        { arbitrage: 500, marl: 200, amm: 300, 'alpha-lab': 800 },
        1727500000000
      );
      expect(snap1.prevHash).toContain('GENESIS');

      // Append day 2 snapshot
      const snap2 = ledger.appendSnapshot(
        101800,
        { arbitrage: 0.26, marl: 0.24, amm: 0.24, 'alpha-lab': 0.26 },
        { arbitrage: 450, marl: -100, amm: 250, 'alpha-lab': 1200 },
        1727586400000
      );
      expect(snap2.prevHash).toBe(snap1.currentHash);

      // Verify chain integrity
      const audit = ledger.verifyChainIntegrity();
      expect(audit.isValid).toBe(true);

      // Generate Markdown run-card
      const runCard = ledger.generateMarkdownRunCard();
      expect(runCard).toContain('# End-of-Day Risk Ledger Run-Card');
      expect(runCard).toContain('Total Snapshots: 2');
      expect(runCard).toContain('VERIFIED');
    });
  });
}
