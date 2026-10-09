import { describe, it, expect } from 'vitest';
import { BawEngine } from '../../../../src/desk/quadraticamerican/baw-engine.js';
import { BawOptionParams } from '../../../../src/desk/quadraticamerican/baw-types.js';

describe('Barone-Adesi & Whaley (1987) Quadratic American Engine', () => {
  const basePutParams: BawOptionParams = {
    spot: 100,
    strike: 100,
    timeToExpiry: 0.5,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    volatility: 0.25,
    isCall: false,
  };

  it('guarantees American put premium over European put (early exercise >= 0)', () => {
    const res = BawEngine.price(basePutParams);
    expect(res.americanPrice).toBeGreaterThanOrEqual(res.europeanPrice);
    expect(res.earlyExercisePremium).toBeGreaterThan(0);
    expect(res.americanPrice).toBeGreaterThan(basePutParams.strike - basePutParams.spot);
    expect(res.criticalSpot).toBeLessThan(basePutParams.strike);
  });

  it('converges to intrinsic value for deep in-the-money put below critical boundary', () => {
    const deepItmPut: BawOptionParams = {
      ...basePutParams,
      spot: 50,
      strike: 100,
    };
    const res = BawEngine.price(deepItmPut);
    expect(res.spot || 50).toBeLessThan(res.criticalSpot);
    expect(res.americanPrice).toBeCloseTo(50, 4);
    expect(res.greeks.delta).toBeCloseTo(-1.0, 1);
  });

  it('collapses early exercise premium for call with zero dividend yield', () => {
    const zeroDivCall: BawOptionParams = {
      ...basePutParams,
      isCall: true,
      dividendYield: 0.0,
    };
    const res = BawEngine.price(zeroDivCall);
    expect(res.earlyExercisePremium).toBeCloseTo(0, 3);
    expect(res.americanPrice).toBeCloseTo(res.europeanPrice, 3);
    expect(res.greeks.delta).toBeGreaterThan(0.5);
    expect(res.greeks.delta).toBeLessThan(1.0);
  });

  it('exhibits significant early exercise premium for high dividend call', () => {
    const highDivCall: BawOptionParams = {
      ...basePutParams,
      isCall: true,
      dividendYield: 0.08,
    };
    const res = BawEngine.price(highDivCall);
    expect(res.earlyExercisePremium).toBeGreaterThan(0.01);
    expect(res.americanPrice).toBeGreaterThan(res.europeanPrice);
    expect(res.criticalSpot).toBeGreaterThan(highDivCall.strike);
  });

  it('validates option inputs and rejects illegal boundaries', () => {
    expect(() => BawEngine.price({ ...basePutParams, spot: -10 })).toThrow(/strictly positive/);
    expect(() => BawEngine.price({ ...basePutParams, strike: 0 })).toThrow(/strictly positive/);
    expect(() => BawEngine.price({ ...basePutParams, volatility: -0.2 })).toThrow(/strictly positive/);
    expect(() => BawEngine.price({ ...basePutParams, timeToExpiry: -1 })).toThrow(/cannot be negative/);
  });

  it('calculates consistent American Greeks signs', () => {
    const callRes = BawEngine.price({ ...basePutParams, isCall: true, dividendYield: 0.04 });
    const putRes = BawEngine.price(basePutParams);

    expect(callRes.greeks.delta).toBeGreaterThan(0);
    expect(putRes.greeks.delta).toBeLessThan(0);
    expect(callRes.greeks.gamma).toBeGreaterThanOrEqual(0);
    expect(putRes.greeks.gamma).toBeGreaterThanOrEqual(0);
    expect(callRes.greeks.vega).toBeGreaterThan(0);
    expect(putRes.greeks.vega).toBeGreaterThan(0);
  });
});
