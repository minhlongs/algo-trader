import { describe, it, expect } from 'vitest';
import { PriceImprovementVerifier } from '../../../src/desk/sor/price-improvement';
import { RoutingPlan } from '../../../src/desk/sor/sor-types';

describe('PriceImprovementVerifier', () => {
  const verifier = new PriceImprovementVerifier();

  it('verifies BUY orders when SOR cost is strictly <= naive cost', () => {
    expect(verifier.verify(9980, 10000, 'BUY')).toBe(true);
    expect(verifier.verify(10000, 10000, 'BUY')).toBe(true);
    // Epsilon tolerance check
    expect(verifier.verify(10000.0000005, 10000, 'BUY')).toBe(true);
    // Inferior cost
    expect(verifier.verify(10050, 10000, 'BUY')).toBe(false);
  });

  it('verifies SELL orders when SOR proceeds are strictly >= naive proceeds', () => {
    expect(verifier.verify(10050, 10000, 'SELL')).toBe(true);
    expect(verifier.verify(10000, 10000, 'SELL')).toBe(true);
    // Inferior proceeds
    expect(verifier.verify(9950, 10000, 'SELL')).toBe(false);
  });

  it('calculates dollar savings and basis points accurately', () => {
    // BUY: Naive cost $10,000, SOR cost $9,980 -> $20 savings = 20 bps
    const buyResult = verifier.calculatePriceImprovement(9980, 10000, 'BUY');
    expect(buyResult.savingsUsd).toBe(20.0);
    expect(buyResult.improvementBps).toBe(20.0);
    expect(buyResult.isImprovementValid).toBe(true);

    // SELL: Naive proceeds $50,000, SOR proceeds $50,150 -> $150 savings = 30 bps
    const sellResult = verifier.calculatePriceImprovement(50150, 50000, 'SELL');
    expect(sellResult.savingsUsd).toBe(150.0);
    expect(sellResult.improvementBps).toBe(30.0);
    expect(sellResult.isImprovementValid).toBe(true);
  });

  it('evaluates a complete RoutingPlan against benchmark', () => {
    const plan: RoutingPlan = {
      routeId: 'route-test',
      symbol: 'BTC/USDT',
      side: 'BUY',
      totalQuantity: 1.0,
      allocations: [],
      expectedEffectivePrice: 59950,
      expectedTotalFeeUsd: 4.5,
      expectedGasCostUsd: 0,
      expectedNetProceedsUsd: 59954.5,
      priceImprovementBps: 15.0,
      naiveBestVenue: 'binance',
      naiveTotalCostUsd: 60044.5,
      timestamp: Date.now(),
    };

    const res = verifier.evaluatePlan(plan);
    expect(res.savingsUsd).toBeCloseTo(90.0, 1);
    expect(res.improvementBps).toBeCloseTo(14.99, 1);
    expect(res.isImprovementValid).toBe(true);
  });
});
