import { describe, expect, it } from 'vitest';
import { VarianceGammaCharFn } from '../../../../src/desk/variancegamma/variance-gamma-char-fn';
import { VarianceGammaEngine } from '../../../../src/desk/variancegamma/variance-gamma-engine';
import {
  VgModelParameters,
  VgOptionSpec,
} from '../../../../src/desk/variancegamma/variance-gamma-types';

describe('Variance Gamma Engine Suite (Desk 92)', () => {
  const engine = new VarianceGammaEngine();

  const standardParams: VgModelParameters = {
    sigma: 0.2, // 20% annual volatility
    nu: 0.15,   // positive gamma variance
    theta: -0.1, // negative drift (negative skew typical for equities)
  };

  const standardSpec: VgOptionSpec = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 1.0,
    riskFreeRatePct: 5.0,
    dividendYieldPct: 2.0,
    isCall: true,
  };

  it('should compute valid drift corrector and statistical moments with excess kurtosis', () => {
    const omega = VarianceGammaCharFn.calculateDriftCorrector(standardParams);
    expect(omega).toBeGreaterThan(0.0);

    const moments = VarianceGammaCharFn.calculateMoments(standardParams, 1.0);
    expect(moments.variance).toBeGreaterThan(0.0);
    expect(moments.skewness).toBeLessThan(0.0); // negative theta produces negative skew
    expect(moments.excessKurtosis).toBeGreaterThan(0.0); // fat tails (leptokurtic)
  });

  it('should price European call and put options conforming to Put-Call Parity', () => {
    const callRes = engine.priceOption(standardParams, standardSpec);
    const putRes = engine.priceOption(standardParams, { ...standardSpec, isCall: false });

    expect(callRes.optionPrice).toBeGreaterThan(0.0);
    expect(putRes.optionPrice).toBeGreaterThan(0.0);
    expect(callRes.optionPrice).toBeGreaterThanOrEqual(callRes.intrinsicValue);
    expect(putRes.optionPrice).toBeGreaterThanOrEqual(putRes.intrinsicValue);

    // Put-Call Parity check: C - P = S*exp(-q*T) - K*exp(-r*T)
    const S = standardSpec.spotPrice;
    const K = standardSpec.strikePrice;
    const T = standardSpec.timeToExpiryYears;
    const r = standardSpec.riskFreeRatePct / 100.0;
    const q = (standardSpec.dividendYieldPct || 0.0) / 100.0;
    const expectedDiff = S * Math.exp(-q * T) - K * Math.exp(-r * T);

    const actualDiff = callRes.optionPrice - putRes.optionPrice;
    expect(actualDiff).toBeCloseTo(expectedDiff, 2);
  });

  it('should throw when martingale condition is violated or invalid inputs provided', () => {
    expect(() =>
      VarianceGammaCharFn.calculateDriftCorrector({
        sigma: 2.0,
        nu: 2.0,
        theta: 1.0,
      })
    ).toThrow('Martingale condition violated');

    expect(() =>
      engine.priceOption(standardParams, { ...standardSpec, spotPrice: -100 })
    ).toThrow('Spot and strike prices must be positive');
  });
});
