import { describe, it, expect } from 'vitest';
import { MargrabeEngine } from '../../../../src/desk/margrabe/margrabe-engine';
import { MargrabeParams } from '../../../../src/desk/margrabe/margrabe-types';

describe('Desk 132: Margrabe (1978) Dual-Asset Exchange Option Engine', () => {
  const baseParams: MargrabeParams = {
    spot1: 100.0,
    spot2: 95.0,
    volatility1: 0.25,
    volatility2: 0.20,
    correlation: 0.5,
    timeToMaturity: 1.0,
    dividendYield1: 0.02,
    dividendYield2: 0.03,
  };

  it('calculates benchmark exchange option price and valid analytical Greeks', () => {
    const result = MargrabeEngine.price(baseParams);

    expect(result.optionPrice).toBeGreaterThan(0.0);
    expect(result.compositeVol).toBeGreaterThan(0.0);
    // Delta 1 > 0, Delta 2 < 0
    expect(result.greeks.delta1).toBeGreaterThan(0.0);
    expect(result.greeks.delta1).toBeLessThanOrEqual(1.0);
    expect(result.greeks.delta2).toBeLessThan(0.0);
    expect(result.greeks.delta2).toBeGreaterThanOrEqual(-1.0);

    // Convexity & Greeks
    expect(result.greeks.gamma1).toBeGreaterThan(0.0);
    expect(result.greeks.gamma2).toBeGreaterThan(0.0);
    expect(result.greeks.crossGamma).toBeLessThan(0.0);
  });

  it('verifies exchange parity symmetry condition to machine precision', () => {
    const result = MargrabeEngine.price(baseParams);

    // C(S1, S2) - C(S2, S1) = S1*exp(-q1*T) - S2*exp(-q2*T)
    expect(result.exchangeParityError).toBeLessThan(1e-10);
  });

  it('confirms correlation dampens composite volatility and option price', () => {
    const lowCorr = MargrabeEngine.price({ ...baseParams, correlation: -0.5 });
    const highCorr = MargrabeEngine.price({ ...baseParams, correlation: 0.8 });

    expect(lowCorr.compositeVol).toBeGreaterThan(highCorr.compositeVol);
    expect(lowCorr.optionPrice).toBeGreaterThan(highCorr.optionPrice);
  });

  it('handles zero dividend yields correctly', () => {
    const noDivs = MargrabeEngine.price({
      ...baseParams,
      dividendYield1: 0.0,
      dividendYield2: 0.0,
    });

    expect(noDivs.optionPrice).toBeGreaterThan(0.0);
    expect(noDivs.exchangeParityError).toBeLessThan(1e-10);
    // When spot1 == spot2, C(S, S) - C(S, S) == 0
    const symmetric = MargrabeEngine.price({
      ...baseParams,
      spot1: 100,
      spot2: 100,
      volatility1: 0.2,
      volatility2: 0.2,
      dividendYield1: 0.0,
      dividendYield2: 0.0,
    });
    expect(symmetric.exchangeParityError).toBeLessThan(1e-12);
  });

  it('validates input parameters and throws descriptive errors', () => {
    expect(() => MargrabeEngine.price({ ...baseParams, spot1: -10 })).toThrow(/Invalid spot1/);
    expect(() => MargrabeEngine.price({ ...baseParams, spot2: 0 })).toThrow(/Invalid spot2/);
    expect(() => MargrabeEngine.price({ ...baseParams, volatility1: -0.1 })).toThrow(/Invalid volatility1/);
    expect(() => MargrabeEngine.price({ ...baseParams, correlation: 1.5 })).toThrow(/Invalid correlation/);
    expect(() => MargrabeEngine.price({ ...baseParams, timeToMaturity: 0 })).toThrow(/Invalid timeToMaturity/);
    expect(() => MargrabeEngine.price({ ...baseParams, dividendYield1: -0.01 })).toThrow(/Invalid dividendYield1/);
  });
});
