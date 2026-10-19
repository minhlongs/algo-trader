import { describe, it, expect } from 'vitest';
import { RollEngine } from '../../../../src/desk/rollspread/roll-engine.js';
import { RollMath } from '../../../../src/desk/rollspread/roll-math.js';

describe('Roll (1984) Effective Bid-Ask Spread Microstructure Engine', () => {
  it('measures negative serial autocovariance from alternating bid-ask bounce', () => {
    // When prices bounce between bid (99) and ask (101) with spread S = 2 (half-spread c = 1)
    const alternatingTrades = [101, 99, 101, 99, 101, 99, 101, 99, 101, 99];
    const res = RollEngine.estimateSpread(alternatingTrades);

    expect(res.isCovarianceNegative).toBe(true);
    expect(res.firstOrderCovariance).toBeLessThan(0);
    // For deterministic alternation, Cov(deltaP_t, deltaP_{t-1}) = -S^2, so 2*sqrt(-cov) ~ 2*S = 4.0
    expect(res.effectiveSpread).toBeCloseTo(4.0, 1);
    expect(res.percentageSpread).toBeGreaterThan(3.5);
  });

  it('handles negative covariance and computes positive bounce variance share', () => {
    const trades = [100.25, 99.75, 100.20, 99.80, 100.30, 99.70, 100.25, 99.75];
    const res = RollEngine.estimateSpread(trades);

    expect(res.effectiveSpread).toBeGreaterThan(0);
    expect(res.bounceVarianceShare).toBeGreaterThan(0);
    expect(res.bounceVarianceShare).toBeLessThanOrEqual(1.0);
  });

  it('handles positive covariance according to config mode', () => {
    // Accelerating trending prices with varying positive steps -> positive autocovariance
    const acceleratingTrades = [100, 101, 103, 106, 110, 115, 121, 128];
    const zeroRes = RollEngine.estimateSpread(acceleratingTrades, { handlePositiveCovariance: 'zero' });
    expect(zeroRes.isCovarianceNegative).toBe(false);
    expect(zeroRes.effectiveSpread).toBe(0);

    const magRes = RollEngine.estimateSpread(acceleratingTrades, { handlePositiveCovariance: 'magnitude' });
    expect(magRes.isCovarianceNegative).toBe(false);
    expect(magRes.effectiveSpread).toBeGreaterThan(0);
  });

  it('correctly calculates basic price changes and autocovariance primitives', () => {
    const prices = [10, 12, 10, 12];
    const diffs = RollMath.calculatePriceChanges(prices);
    expect(diffs).toEqual([2, -2, 2]);

    const cov = RollMath.autocovarianceLag1(diffs);
    expect(cov).toBeLessThan(0);
  });

  it('validates minimum trade observations and positive prices', () => {
    expect(() => RollEngine.estimateSpread([100, 101, 102])).toThrow(/Insufficient trade points/);
    expect(() => RollEngine.estimateSpread([100, -10, 102, 103, 104])).toThrow(/strictly positive/);
  });
});
