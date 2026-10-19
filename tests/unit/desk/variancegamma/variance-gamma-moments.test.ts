import { describe, expect, it } from 'vitest';
import {
  VarianceGammaMomentsEngine,
  VarianceGammaMomentsMath,
  VarianceGammaMomentsParams,
} from '../../../../src/desk/variancegamma';

describe('Variance Gamma Moments & Option Pricing (Madan-Carr-Chang 1998)', () => {
  const baseParams: VarianceGammaMomentsParams = {
    spotPrice: 100,
    strikePrice: 100,
    timeToMaturity: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    sigma: 0.20,
    nu: 0.20,
    theta: -0.10,
    isCall: true,
  };

  it('calculates drift compensator omega ensuring martingale property', () => {
    const omega = VarianceGammaMomentsMath.calculateOmega(0.20, 0.20, -0.10);
    // arg = 1 - (-0.1*0.2) - 0.5*(0.04)*0.2 = 1 + 0.02 - 0.004 = 1.016
    // omega = (1 / 0.2) * ln(1.016)
    const expected = (1.0 / 0.20) * Math.log(1.016);
    expect(omega).toBeCloseTo(expected, 8);
  });

  it('evaluates analytical moments: mean, variance, skewness, kurtosis', () => {
    const moments = VarianceGammaMomentsMath.calculateAnalyticalMoments(
      0.20,
      0.20,
      -0.10,
      1.0
    );

    // E[X_1] = theta * 1 = -0.10
    expect(moments.mean).toBeCloseTo(-0.10, 6);

    // Var[X_1] = sigma^2 + nu * theta^2 = 0.04 + 0.20 * 0.01 = 0.042
    expect(moments.variance).toBeCloseTo(0.042, 6);
    expect(moments.stdDev).toBeCloseTo(Math.sqrt(0.042), 6);

    // Negative theta induces negative skewness
    expect(moments.skewness).toBeLessThan(0.0);

    // Positive nu induces positive excess kurtosis
    expect(moments.excessKurtosis).toBeGreaterThan(0.0);
  });

  it('prices European Call and Put via adaptive Gil-Pelaez quadrature', () => {
    const callResult = VarianceGammaMomentsEngine.calculate(baseParams);
    const putResult = VarianceGammaMomentsEngine.calculate({
      ...baseParams,
      isCall: false,
    });

    expect(callResult.price).toBeGreaterThan(8.0);
    expect(callResult.price).toBeLessThan(15.0);
    expect(callResult.p1).toBeGreaterThan(callResult.p2);
    expect(callResult.p1).toBeGreaterThan(0.5);
    expect(callResult.p2).toBeGreaterThan(0.5);

    // Put-call parity: C - P = S*exp(-q*T) - K*exp(-r*T)
    const expectedParity =
      baseParams.spotPrice * Math.exp(-baseParams.dividendYield * baseParams.timeToMaturity) -
      baseParams.strikePrice * Math.exp(-baseParams.riskFreeRate * baseParams.timeToMaturity);
    const actualParity = callResult.callPrice - putResult.putPrice;

    expect(actualParity).toBeCloseTo(expectedParity, 3);
    expect(putResult.price).toBeCloseTo(putResult.putPrice, 8);
  });

  it('enforces monotonic option prices with strike progression', () => {
    const callItm = VarianceGammaMomentsEngine.calculate({
      ...baseParams,
      strikePrice: 90,
    });
    const callAtm = VarianceGammaMomentsEngine.calculate({
      ...baseParams,
      strikePrice: 100,
    });
    const callOtm = VarianceGammaMomentsEngine.calculate({
      ...baseParams,
      strikePrice: 110,
    });

    expect(callItm.price).toBeGreaterThan(callAtm.price);
    expect(callAtm.price).toBeGreaterThan(callOtm.price);
  });

  it('throws an error when martingale condition or input bounds are violated', () => {
    expect(() =>
      VarianceGammaMomentsEngine.calculate({
        ...baseParams,
        theta: 2.0,
        nu: 1.0,
      })
    ).toThrow(/martingale condition violated/i);

    expect(() =>
      VarianceGammaMomentsEngine.calculate({
        ...baseParams,
        spotPrice: -10,
      })
    ).toThrow(/strictly positive/i);
  });
});
