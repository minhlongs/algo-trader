import { describe, it, expect } from 'vitest';
import { CRREngine } from '../../../../src/desk/crr/crr-engine.js';
import { CRROptionParams } from '../../../../src/desk/crr/crr-types.js';

describe('CRREngine (1979 Binomial Options & American Early Exercise)', () => {
  const baseParams: CRROptionParams = {
    spotPrice: 100,
    strikePrice: 100,
    timeToExpiry: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    volatility: 0.20,
    steps: 100,
    isCall: true,
    isAmerican: false,
  };

  it('validates parameters strictly', () => {
    expect(() => CRREngine.price({ ...baseParams, spotPrice: -100 })).toThrow();
    expect(() => CRREngine.price({ ...baseParams, strikePrice: 0 })).toThrow();
    expect(() => CRREngine.price({ ...baseParams, steps: 1 })).toThrow();
  });

  it('prices European call option accurately close to Black-Scholes analytical (~10.45)', () => {
    const res = CRREngine.price(baseParams);

    expect(res.optionPrice).toBeGreaterThan(10.3);
    expect(res.optionPrice).toBeLessThan(10.6);
    expect(res.upFactor).toBeGreaterThan(1.0);
    expect(res.downFactor).toBeLessThan(1.0);
    expect(res.riskNeutralProb).toBeGreaterThan(0.4);
    expect(res.riskNeutralProb).toBeLessThan(0.6);
  });

  it('satisfies European Put-Call Parity within lattice discretization tolerance', () => {
    const callRes = CRREngine.price({ ...baseParams, isCall: true, isAmerican: false });
    const putRes = CRREngine.price({ ...baseParams, isCall: false, isAmerican: false });

    // C - P = S - K * exp(-r * T)
    const theoreticalDiff = baseParams.spotPrice - baseParams.strikePrice * Math.exp(-baseParams.riskFreeRate * baseParams.timeToExpiry);
    const actualDiff = callRes.optionPrice - putRes.optionPrice;

    expect(Math.abs(actualDiff - theoreticalDiff)).toBeLessThan(0.05);
  });

  it('demonstrates early exercise premium for in-the-money American Put options', () => {
    const itmPutParams: CRROptionParams = {
      ...baseParams,
      spotPrice: 70,
      strikePrice: 100,
      isCall: false,
      isAmerican: true,
    };

    const americanPut = CRREngine.price(itmPutParams);
    const europeanPut = CRREngine.price({ ...itmPutParams, isAmerican: false });

    expect(americanPut.optionPrice).toBeGreaterThanOrEqual(europeanPut.optionPrice);
    expect(americanPut.earlyExercisePremium).toBeGreaterThan(0);
    // At spot 70 and strike 100, intrinsic is 30. American put must be at least intrinsic value!
    expect(americanPut.optionPrice).toBeGreaterThanOrEqual(30.0);
  });

  it('computes sensible lattice Greeks', () => {
    const res = CRREngine.price(baseParams, true);
    const { delta, gamma, theta, vega, rho } = res.greeks;

    expect(delta).toBeGreaterThan(0.5);
    expect(delta).toBeLessThan(0.7);
    expect(gamma).toBeGreaterThan(0);
    expect(vega).toBeGreaterThan(0);
    expect(theta).toBeLessThan(0);
    expect(rho).toBeGreaterThan(0);
  });
});
