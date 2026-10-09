import { describe, it, expect } from 'vitest';
import { Stoll89Engine } from '../../../../src/desk/stoll89/stoll89-engine.js';
import { StollTradeObservation } from '../../../../src/desk/stoll89/stoll89-types.js';

describe('Desk 173: Stoll (1989) Microstructure Covariance Spread Engine', () => {
  const sampleObservations: StollTradeObservation[] = [
    { timestamp: 1000, tradePrice: 100.05, bidPrice: 100.00, askPrice: 100.10, tradeDirection: 1 },
    { timestamp: 2000, tradePrice: 100.00, bidPrice: 100.00, askPrice: 100.10, tradeDirection: -1 },
    { timestamp: 3000, tradePrice: 100.08, bidPrice: 100.00, askPrice: 100.10, tradeDirection: 1 },
    { timestamp: 4000, tradePrice: 100.01, bidPrice: 100.00, askPrice: 100.10, tradeDirection: -1 },
    { timestamp: 5000, tradePrice: 100.06, bidPrice: 100.00, askPrice: 100.10, tradeDirection: 1 },
    { timestamp: 6000, tradePrice: 100.02, bidPrice: 100.00, askPrice: 100.10, tradeDirection: -1 },
    { timestamp: 7000, tradePrice: 100.07, bidPrice: 100.00, askPrice: 100.10, tradeDirection: 1 },
    { timestamp: 8000, tradePrice: 100.01, bidPrice: 100.00, askPrice: 100.10, tradeDirection: -1 },
    { timestamp: 9000, tradePrice: 100.09, bidPrice: 100.00, askPrice: 100.10, tradeDirection: 1 },
    { timestamp: 10000, tradePrice: 100.00, bidPrice: 100.00, askPrice: 100.10, tradeDirection: -1 },
  ];

  it('validates sample size and requires at least 5 trade observations', () => {
    expect(() =>
      Stoll89Engine.decompose({ observations: sampleObservations.slice(0, 3) })
    ).toThrow(/at least 5 trade observations/);
  });

  it('decomposes bid-ask spread into alpha, beta, and gamma shares summing to 1', () => {
    const res = Stoll89Engine.decompose({ observations: sampleObservations });

    expect(res.sampleSize).toBe(10);
    expect(res.quotedSpread).toBeCloseTo(0.10, 4);
    expect(res.effectiveSpread).toBeGreaterThan(0);

    expect(res.adverseSelectionShare).toBeGreaterThanOrEqual(0);
    expect(res.inventoryHoldingShare).toBeGreaterThanOrEqual(0);
    expect(res.orderProcessingShare).toBeGreaterThanOrEqual(0);

    const totalShare = res.adverseSelectionShare + res.inventoryHoldingShare + res.orderProcessingShare;
    expect(totalShare).toBeCloseTo(1.0, 4);
  });

  it('correctly calculates empirical reversal probability pi from signed trade directions', () => {
    const res = Stoll89Engine.decompose({ observations: sampleObservations });

    // Alternating +1, -1 directions give 100% reversals
    expect(res.reversalProbability).toBeGreaterThan(0.5);
    expect(Number.isFinite(res.priceAutocovariance)).toBe(true);
    expect(Number.isFinite(res.midpointAutocovariance)).toBe(true);
  });
});
