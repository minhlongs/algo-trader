import { describe, it, expect } from 'vitest';
import { AsianEngine } from '../../../../src/desk/asian/asian-engine';

describe('AsianEngine — Kemna-Vorst & Turnbull-Wakeman Asian Options Suite', () => {
  const baseParams = {
    spot: 100,
    strike: 100,
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    volatility: 0.25,
    timeToExpiry: 1.0,
  };

  it('computes positive call and put premiums for both geometric and arithmetic options', () => {
    const res = AsianEngine.calculate(baseParams);

    expect(res.geometricCall).toBeGreaterThan(0.0);
    expect(res.geometricPut).toBeGreaterThan(0.0);
    expect(res.arithmeticCall).toBeGreaterThan(0.0);
    expect(res.arithmeticPut).toBeGreaterThan(0.0);
    expect(res.effectiveVolatility).toBeGreaterThan(0.0);
    expect(res.effectiveVolatility).toBeLessThan(baseParams.volatility);
  });

  it('preserves AM-GM convexity inequality: arithmetic call >= geometric call', () => {
    const res = AsianEngine.calculate(baseParams);

    expect(res.arithmeticCall).toBeGreaterThanOrEqual(res.geometricCall);
  });

  it('verifies arithmetic put-call parity against discounted expected average', () => {
    const res = AsianEngine.calculate(baseParams);
    const discount = Math.exp(-baseParams.riskFreeRate * baseParams.timeToExpiry);
    const expectedDifference = discount * (res.expectedAverage - baseParams.strike);
    const actualDifference = res.arithmeticCall - res.arithmeticPut;

    expect(actualDifference).toBeCloseTo(expectedDifference, 4);
  });

  it('evaluates consistent Greeks: positive delta, positive vega, and positive gamma', () => {
    const res = AsianEngine.calculate(baseParams);

    expect(res.greeks.delta).toBeGreaterThan(0.0);
    expect(res.greeks.delta).toBeLessThan(1.0);
    expect(res.greeks.gamma).toBeGreaterThanOrEqual(0.0);
    expect(res.greeks.vega).toBeGreaterThan(0.0);
  });

  it('throws descriptive error on invalid non-positive parameters', () => {
    expect(() =>
      AsianEngine.calculate({
        ...baseParams,
        spot: -50,
      })
    ).toThrow('spot and strike must be > 0');

    expect(() =>
      AsianEngine.calculate({
        ...baseParams,
        volatility: 0,
      })
    ).toThrow('volatility must be > 0');

    expect(() =>
      AsianEngine.calculate({
        ...baseParams,
        timeToExpiry: -1,
      })
    ).toThrow('timeToExpiry must be > 0');
  });
});
