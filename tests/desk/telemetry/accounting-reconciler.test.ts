import { describe, it, expect } from 'vitest';
import { AccountingReconciler } from '../../../src/desk/telemetry/accounting-reconciler';
import type { ConsolidatedPortfolioSnapshot } from '../../../src/desk/telemetry/telemetry-types';

describe('AccountingReconciler', () => {
  it('verifies zero drift when portfolio balance equals cash plus sum of engine capital and pnl', () => {
    const res = AccountingReconciler.verifyZeroDrift(
      105000,
      25000,
      { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
    );
    expect(res.isZeroDrift).toBe(true);
    expect(res.driftUsd).toBeLessThan(1e-4);
  });

  it('detects drift when balance deviates by more than tolerance', () => {
    const res = AccountingReconciler.verifyZeroDrift(
      105100,
      25000,
      { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
      1e-4
    );
    expect(res.isZeroDrift).toBe(false);
    expect(res.driftUsd).toBeCloseTo(100, 2);
  });

  it('passes boundary drift at 0.00009 USD (< 1e-4)', () => {
    const res = AccountingReconciler.verifyZeroDrift(
      100000.00009,
      20000,
      { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
      1e-4
    );
    expect(res.isZeroDrift).toBe(true);
  });

  it('fails boundary drift at 0.00011 USD (> 1e-4)', () => {
    const res = AccountingReconciler.verifyZeroDrift(
      100000.00011,
      20000,
      { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
      1e-4
    );
    expect(res.isZeroDrift).toBe(false);
  });

  it('reconciles full ConsolidatedPortfolioSnapshot instance', () => {
    const reconciler = new AccountingReconciler();
    const snapshot: ConsolidatedPortfolioSnapshot = {
      timestamp: Date.now(),
      totalEquityUsd: 105000,
      unallocatedCashUsd: 25000,
      allocatedCapitalUsd: 80000,
      totalMtmPnlUsd: 0,
      grossLeverage: 1.0,
      marginUtilizationRatio: 0.2,
      roceAnnualized: 0.1,
      accountingDriftUsd: 0,
      engineSnapshots: {
        arbitrage: { engineId: 'arbitrage', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
        marl: { engineId: 'marl', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
        amm: { engineId: 'amm', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
        'alpha-lab': { engineId: 'alpha-lab', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
      },
    };

    const res = reconciler.reconcileSnapshot(snapshot);
    expect(res.isZeroDrift).toBe(true);
    expect(res.driftUsd).toBe(0);
    expect(res.breakdown?.unallocatedCash).toBe(25000);
  });

  it('flags drift in snapshot when total equity does not match sum', () => {
    const reconciler = new AccountingReconciler();
    const snapshot: ConsolidatedPortfolioSnapshot = {
      timestamp: Date.now(),
      totalEquityUsd: 110000, // 5000 mismatch
      unallocatedCashUsd: 25000,
      allocatedCapitalUsd: 80000,
      totalMtmPnlUsd: 0,
      grossLeverage: 1.0,
      marginUtilizationRatio: 0.2,
      roceAnnualized: 0.1,
      accountingDriftUsd: 0,
      engineSnapshots: {
        arbitrage: { engineId: 'arbitrage', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
        marl: { engineId: 'marl', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
        amm: { engineId: 'amm', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
        'alpha-lab': { engineId: 'alpha-lab', allocatedCapitalUsd: 20000, mtmPnlUsd: 0, marginUsedUsd: 2000, tradeCount: 5 },
      },
    };

    const res = reconciler.reconcileSnapshot(snapshot);
    expect(res.isZeroDrift).toBe(false);
    expect(res.driftUsd).toBe(5000);
  });
});
