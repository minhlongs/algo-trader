import { describe, it, expect } from 'vitest';
import { HestonEngine } from '../../../../src/desk/hestonchf/heston-engine.js';
import { HestonParams } from '../../../../src/desk/hestonchf/heston-types.js';

describe('Heston (1993) Stochastic Volatility Characteristic Function Engine', () => {
  const baseParams: HestonParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    dividendYield: 0.01,
    v0: 0.04, // 20% vol
    kappa: 2.0,
    theta: 0.04,
    sigmaV: 0.3,
    rho: -0.5,
  };

  it('prices European call and put obeying Put-Call parity', () => {
    const res = HestonEngine.price(baseParams);
    expect(res.callPrice).toBeGreaterThan(0);
    expect(res.putPrice).toBeGreaterThan(0);

    // C - P = S*e^{-qT} - K*e^{-rT}
    const parityRhs = baseParams.spot * Math.exp(-baseParams.dividendYield * baseParams.timeToExpiry) -
      baseParams.strike * Math.exp(-baseParams.riskFreeRate * baseParams.timeToExpiry);
    expect(res.callPrice - res.putPrice).toBeCloseTo(parityRhs, 4);
  });

  it('correctly evaluates the Feller condition ratio', () => {
    // 2 * kappa * theta / sigmaV^2 = 2 * 2.0 * 0.04 / 0.09 = 0.16 / 0.09 = 1.777 > 1
    const res = HestonEngine.price(baseParams);
    expect(res.fellerSatisfied).toBe(true);
    expect(res.fellerRatio).toBeCloseTo(1.7777, 3);

    const violated = HestonEngine.price({ ...baseParams, sigmaV: 0.8 });
    expect(violated.fellerSatisfied).toBe(false);
  });

  it('computes standard Greeks with consistent signs for Call options', () => {
    const res = HestonEngine.price(baseParams);
    expect(res.greeks.delta).toBeGreaterThan(0.4);
    expect(res.greeks.delta).toBeLessThan(0.7);
    expect(res.greeks.gamma).toBeGreaterThan(0);
    expect(res.greeks.vega).toBeGreaterThan(0);
    expect(res.greeks.rho).toBeGreaterThan(0);
  });

  it('increases option price with increased volatility of variance when out of the money', () => {
    const otmCallLowVol: HestonParams = { ...baseParams, strike: 120, sigmaV: 0.1 };
    const otmCallHighVol: HestonParams = { ...baseParams, strike: 120, sigmaV: 0.4 };

    const lowRes = HestonEngine.price(otmCallLowVol);
    const highRes = HestonEngine.price(otmCallHighVol);

    expect(highRes.callPrice).toBeGreaterThan(lowRes.callPrice);
  });

  it('validates strictly positive inputs and parameter domain', () => {
    expect(() => HestonEngine.price({ ...baseParams, spot: -10 })).toThrow(/positive/);
    expect(() => HestonEngine.price({ ...baseParams, strike: 0 })).toThrow(/positive/);
    expect(() => HestonEngine.price({ ...baseParams, timeToExpiry: -1 })).toThrow(/positive/);
    expect(() => HestonEngine.price({ ...baseParams, rho: 1.5 })).toThrow(/\[-1, 1\]/);
  });
});
