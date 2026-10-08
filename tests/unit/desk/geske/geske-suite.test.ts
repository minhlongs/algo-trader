import { describe, expect, it } from 'vitest';
import { GeskeEngine } from '../../../../src/desk/geske/geske-engine';
import { GeskeParams } from '../../../../src/desk/geske/geske-types';
import { GeskeMath } from '../../../../src/desk/geske/geske-math';

describe('Geske (1979) Compound Option Pricing Suite (Desk 117)', () => {
  const baseParams: GeskeParams = {
    spotPrice: 100.0,
    strike1: 5.0,          // K1: strike price to buy the underlying option
    strike2: 100.0,        // K2: strike price of underlying option
    maturity1: 0.5,        // T1: expiry of compound option (6 months)
    maturity2: 1.0,        // T2: expiry of underlying option (1 year)
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    volatility: 0.25,
    optionType: 'CallOnCall',
  };

  it('should price CallOnCall with positive value, valid critical price S*, and accurate Greeks', () => {
    const result = GeskeEngine.calculate(baseParams);

    expect(result.price).toBeGreaterThan(0.0);
    expect(result.price).toBeLessThan(result.underlyingOptionPrice);
    expect(result.criticalPrice).toBeGreaterThan(0.0);
    expect(result.rho).toBeCloseTo(Math.sqrt(0.5 / 1.0), 5);
    expect(result.delta).toBeGreaterThan(0.0);
    expect(result.gamma).toBeGreaterThan(0.0);
    expect(result.vega).toBeGreaterThan(0.0);
  });

  it('should strictly satisfy Geske Compound Option Put-Call Parity for Calls', () => {
    const callOnCall = GeskeEngine.calculate({ ...baseParams, optionType: 'CallOnCall' });
    const putOnCall = GeskeEngine.calculate({ ...baseParams, optionType: 'PutOnCall' });

    // Compound Put-Call Parity: C_on_C - P_on_C = C_BS(S, T2; K2) - K1 * exp(-r * T1)
    const expectedDiff = callOnCall.underlyingOptionPrice - baseParams.strike1 * Math.exp(-baseParams.riskFreeRate * baseParams.maturity1);
    const actualDiff = callOnCall.price - putOnCall.price;

    expect(actualDiff).toBeCloseTo(expectedDiff, 3);
  });

  it('should strictly satisfy Geske Compound Option Put-Call Parity for Puts', () => {
    const callOnPut = GeskeEngine.calculate({ ...baseParams, optionType: 'CallOnPut' });
    const putOnPut = GeskeEngine.calculate({ ...baseParams, optionType: 'PutOnPut' });

    // Compound Put-Call Parity: C_on_P - P_on_P = P_BS(S, T2; K2) - K1 * exp(-r * T1)
    const expectedDiff = callOnPut.underlyingOptionPrice - baseParams.strike1 * Math.exp(-baseParams.riskFreeRate * baseParams.maturity1);
    const actualDiff = callOnPut.price - putOnPut.price;

    expect(actualDiff).toBeCloseTo(expectedDiff, 3);
  });

  it('should throw error when T1 >= T2 or parameters are non-positive', () => {
    expect(() => GeskeEngine.calculate({ ...baseParams, maturity1: 1.5, maturity2: 1.0 })).toThrow(/must be strictly less/i);
    expect(() => GeskeEngine.calculate({ ...baseParams, spotPrice: 0 })).toThrow(/must be strictly positive/i);
    expect(() => GeskeEngine.calculate({ ...baseParams, volatility: -0.1 })).toThrow(/must be strictly positive/i);
  });

  it('should compute standard bivariate normal CDF with high numerical precision', () => {
    // When rho = 0, M(a, b; 0) = N(a) * N(b)
    const mZero = GeskeMath.bivariateNormalCdf(0.0, 0.0, 0.0);
    expect(mZero).toBeCloseTo(0.25, 5);

    const mIndep = GeskeMath.bivariateNormalCdf(1.0, 1.0, 0.0);
    expect(mIndep).toBeCloseTo(GeskeMath.normalCdf(1.0) * GeskeMath.normalCdf(1.0), 5);

    // Extreme correlations
    expect(GeskeMath.bivariateNormalCdf(1.0, 1.0, 1.0)).toBeCloseTo(GeskeMath.normalCdf(1.0), 5);
  });
});
