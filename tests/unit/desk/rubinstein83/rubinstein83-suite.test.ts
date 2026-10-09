import { describe, it, expect } from 'vitest';
import { Rubinstein83Engine } from '../../../../src/desk/rubinstein83/rubinstein83-engine.js';
import { Rubinstein83Params } from '../../../../src/desk/rubinstein83/rubinstein83-types.js';

describe('Rubinstein (1983) Displaced Diffusion Suite', () => {
  const baseCallParams: Rubinstein83Params = {
    spotPrice: 100,
    strikePrice: 100,
    timeToExpiry: 1.0,
    riskFreeRate: 0.05,
    volatility: 0.2,
    displacementAlpha: 1.0, // When alpha = 1.0, it reduces to Black-Scholes
    isCall: true,
  };

  it('validates parameters and throws on invalid inputs', () => {
    expect(() =>
      Rubinstein83Engine.price({ ...baseCallParams, displacementAlpha: 0 })
    ).toThrow();
    expect(() =>
      Rubinstein83Engine.price({ ...baseCallParams, spotPrice: -10 })
    ).toThrow();
  });

  it('matches Black-Scholes European call when displacementAlpha = 1.0', () => {
    const res = Rubinstein83Engine.price(baseCallParams);
    expect(res.optionPrice).toBeCloseTo(10.4506, 2);
    expect(res.effectiveSpot).toBe(100);
    expect(res.effectiveStrike).toBe(100);
    expect(res.effectiveVolatility).toBe(0.2);
    expect(res.greeks.delta).toBeGreaterThan(0.5);
    expect(res.greeks.vega).toBeGreaterThan(0);
  });

  it('calculates European put and satisfies Put-Call parity consistency', () => {
    const callRes = Rubinstein83Engine.price({ ...baseCallParams, displacementAlpha: 0.8 });
    const putRes = Rubinstein83Engine.price({ ...baseCallParams, displacementAlpha: 0.8, isCall: false });

    const S = baseCallParams.spotPrice;
    const K = baseCallParams.strikePrice;
    const discount = Math.exp(-baseCallParams.riskFreeRate * baseCallParams.timeToExpiry);
    // Put-Call parity: C - P = S - K * exp(-r*T)
    expect(callRes.optionPrice - putRes.optionPrice).toBeCloseTo(S - K * discount, 3);
  });

  it('exhibits skew effect when alpha < 1.0', () => {
    const resStd = Rubinstein83Engine.price(baseCallParams);
    const resDisplaced = Rubinstein83Engine.price({ ...baseCallParams, displacementAlpha: 0.5 });
    expect(resDisplaced.effectiveVolatility).toBe(0.1);
    expect(resDisplaced.optionPrice).toBeGreaterThan(0);
  });
});
