/**
 * Unit tests for the fee seam `applyVenueCosts`.
 *
 * The venue-cost contract in isolation: taker fee on both legs plus gas on
 * both fills, and never a cost credited back into a profit. The ledger-level
 * consequence of these costs lives in `backtest-order-manager-venue-costs.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { applyVenueCosts } from '../backtest-fee-application';

describe('applyVenueCosts', () => {
  it('charges taker fee on both legs plus gas on both fills', () => {
    // 100 shares at 0.50 = $50 notional per leg.
    // taker 10bps: 50 * 0.001 = $0.05 per leg -> $0.10 for the round trip.
    // gas $0.05 per fill -> $0.10 for the round trip.
    const costs = applyVenueCosts({ price: 0.5, size: 100, grossPnl: 10 });

    expect(costs.feeUsd).toBe(0.1);
    expect(costs.gasUsd).toBe(0.1);
    expect(costs.totalCostUsd).toBe(0.2);
    expect(costs.netPnl).toBe(9.8);
  });

  it('reduces net PnL by exactly fee + gas', () => {
    const grossPnl = 3.37;
    const costs = applyVenueCosts({ price: 0.72, size: 40, grossPnl });

    expect(costs.netPnl).toBeCloseTo(grossPnl - costs.totalCostUsd, 10);
  });

  it('turns a winning trade into a loss when costs exceed the edge', () => {
    // 1 share at 0.50 grosses $0.01; costs are $0.20. Loss.
    const costs = applyVenueCosts({ price: 0.5, size: 1, grossPnl: 0.01 });
    expect(costs.netPnl).toBeLessThan(0);
  });

  it('reports break-even at zero when cost exactly equals gross', () => {
    // Size 100 at 0.50 nets exactly $0.20 of cost.
    const costs = applyVenueCosts({ price: 0.5, size: 100, grossPnl: 0.2 });
    expect(costs.netPnl).toBe(0);
  });

  it('never credits costs back into a profit', () => {
    const costs = applyVenueCosts({ price: 0.5, size: 100, grossPnl: -5 });
    expect(costs.netPnl).toBeLessThan(-5);
    expect(costs.netPnl).toBeCloseTo(-5.2, 10);
  });

  it('preserves netPnl === grossPnl - totalCostUsd on a half-cent fee boundary', () => {
    // Notional 5 * 0.50 = $2.50 -> raw fee 0.005 rounds to $0.01; gas $0.10 ->
    // totalCostUsd $0.11. Subtracting after rounding keeps netPnl at $0.89
    // instead of rounding raw 0.895 up to $0.90.
    const costs = applyVenueCosts({ price: 0.5, size: 5, grossPnl: 1 });
    expect(costs.feeUsd).toBe(0.01);
    expect(costs.gasUsd).toBe(0.1);
    expect(costs.totalCostUsd).toBe(0.11);
    expect(costs.netPnl).toBe(0.89);
  });
});
