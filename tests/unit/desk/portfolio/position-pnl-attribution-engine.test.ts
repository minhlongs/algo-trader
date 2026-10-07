import { describe, it, expect } from 'vitest';
import { PositionPnLAttributionEngine } from '../../../../src/desk/portfolio/position-pnl-attribution-engine';

describe('PositionPnLAttributionEngine', () => {
  it('correctly attributes PnL to alpha, spread capture, and fee friction', () => {
    const engine = new PositionPnLAttributionEngine();

    const breakdown = engine.computeAttribution({
      positionId: 'pos-1',
      entryPrice: 0.40,
      exitOrMarkPrice: 0.60,
      quantity: 1000,
      feesPaidUsd: 10,
      spreadCapturedPerUnit: 0.05,
    });

    // Cost basis = 400. Current Value = 600. Gross PnL = 200.
    // Net PnL = 200 - 10 = 190.
    // Spread PnL = 1000 * 0.05 = 50.
    // Alpha PnL = 200 - 50 = 150.
    expect(breakdown.totalGrossPnLUsd).toBe(200);
    expect(breakdown.totalNetPnLUsd).toBe(190);
    expect(breakdown.spreadPnLUsd).toBe(50);
    expect(breakdown.alphaPnLUsd).toBe(150);
    expect(breakdown.feeFrictionUsd).toBe(10);
    expect(breakdown.returnOnCostPct).toBe(47.5);
  });

  it('aggregates portfolio attribution totals', () => {
    const engine = new PositionPnLAttributionEngine();

    const b1 = engine.computeAttribution({
      positionId: 'pos-1',
      entryPrice: 0.50,
      exitOrMarkPrice: 0.60,
      quantity: 100,
      feesPaidUsd: 2,
    });

    const b2 = engine.computeAttribution({
      positionId: 'pos-2',
      entryPrice: 0.50,
      exitOrMarkPrice: 0.40,
      quantity: 100,
      feesPaidUsd: 2,
    });

    const agg = engine.aggregatePortfolio([b1, b2]);
    // b1: gross 10, net 8
    // b2: gross -10, net -12
    expect(agg.totalNetPnLUsd).toBe(-4);
    expect(agg.totalFeeFrictionUsd).toBe(4);
  });
});
