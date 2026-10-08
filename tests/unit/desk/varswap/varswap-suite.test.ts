import { describe, it, expect } from 'vitest';
import { VarianceSwapReplicator } from '../../../../src/desk/varswap/variance-swap-replicator';
import { VarianceSwapPnlEngine } from '../../../../src/desk/varswap/variance-swap-pnl-engine';
import { OutOfTheMoneyOption, VarianceSwapTerms } from '../../../../src/desk/varswap/varswap-types';

describe('Variance & Volatility Swaps Desk Suite', () => {
  it('replicates fair variance from discrete OTM option strip', () => {
    const replicator = new VarianceSwapReplicator();

    // OTM option portfolio centered around S=100
    const options: OutOfTheMoneyOption[] = [
      { strike: 80, optionType: 'PUT', priceUsd: 1.20 },
      { strike: 90, optionType: 'PUT', priceUsd: 2.80 },
      { strike: 100, optionType: 'CALL', priceUsd: 5.50 },
      { strike: 110, optionType: 'CALL', priceUsd: 2.40 },
      { strike: 120, optionType: 'CALL', priceUsd: 0.90 },
    ];

    const res = replicator.replicateFairVariance(100, 4.0, 1.0, options);

    expect(res.fairVarianceStrike).toBeGreaterThan(0.01);
    expect(res.fairVolStrikePct).toBeGreaterThan(10.0);
    expect(res.fairVolStrikePct).toBeLessThan(40.0);
    expect(res.optionsCount).toBe(5);
  });

  it('computes variance swap payoff and vol swap convexity adjustment', () => {
    const pnlEngine = new VarianceSwapPnlEngine();

    const terms: VarianceSwapTerms = {
      strikeVolatilityPct: 20.0, // 20% vol strike -> Var strike = 0.04
      notionalVegaUsd: 50000,   // $50k vega
      timeToMaturityYears: 0.5,
    };

    // If realized vol = 25%, payoff should be positive
    const res = pnlEngine.calculatePayoff(terms, 25.0);

    expect(res.varianceNotionalUsd).toBe(125000); // 50000 / (2 * 0.20) = 125,000
    expect(res.payoffUsd).toBeGreaterThan(0);
    expect(res.volSwapApproxPayoffUsd).toBeGreaterThan(0);
    expect(res.convexityAdjustmentBps).toBeGreaterThan(0);
  });
});
