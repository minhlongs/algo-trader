import { describe, it, expect } from 'vitest';
import { CarrWuEngine, CarrWuMath } from '../../../../src/desk/carrwu';

describe('Carr-Wu (2004) FMLS Option Pricing Suite', () => {
  const defaultParams = {
    alpha: 1.7,
    sigma: 0.25,
    rate: 0.05,
    dividendYield: 0.01,
  };

  it('calculates martingale convexity adjustment omega correctly', () => {
    const omega = CarrWuMath.computeConvexityAdjustment(1.7, 0.25);
    expect(omega).toBeGreaterThan(0);
    expect(Number.isFinite(omega)).toBe(true);

    expect(() => CarrWuMath.computeConvexityAdjustment(1.0, 0.25)).toThrow();
    expect(() => CarrWuMath.computeConvexityAdjustment(2.1, 0.25)).toThrow();
    expect(() => CarrWuMath.computeConvexityAdjustment(1.5, -0.1)).toThrow();
  });

  it('satisfies put-call parity under FMLS dynamics', () => {
    const engine = new CarrWuEngine();
    const spot = 100;
    const strike = 105;
    const T = 0.5;

    const callRes = engine.calculate({
      spot,
      strike,
      timeToMaturity: T,
      optionType: 'call',
      params: defaultParams,
    });

    const putRes = engine.calculate({
      spot,
      strike,
      timeToMaturity: T,
      optionType: 'put',
      params: defaultParams,
    });

    const discountS = spot * Math.exp(-defaultParams.dividendYield * T);
    const discountK = strike * Math.exp(-defaultParams.rate * T);
    const parityDiff = callRes.price - putRes.price - (discountS - discountK);

    expect(Math.abs(parityDiff)).toBeLessThan(1e-4);
  });

  it('produces valid Greeks and delta bounds', () => {
    const engine = new CarrWuEngine();
    const res = engine.calculate({
      spot: 100,
      strike: 100,
      timeToMaturity: 1.0,
      optionType: 'call',
      params: defaultParams,
    });

    expect(res.greeks.delta).toBeGreaterThan(0.4);
    expect(res.greeks.delta).toBeLessThan(0.7);
    expect(res.greeks.gamma).toBeGreaterThan(0);
    expect(res.greeks.vega).toBeGreaterThan(0);
    expect(res.greeks.theta).toBeLessThan(0);
    expect(Number.isFinite(res.greeks.skewSensitivity)).toBe(true);
  });

  it('converges toward Black-Scholes as alpha approaches 2.0', () => {
    const engine = new CarrWuEngine();
    const spot = 100;
    const strike = 100;
    const T = 0.5;

    // alpha = 1.99 represents near-Gaussian limit
    const fmlsNearGaussian = engine.calculate({
      spot,
      strike,
      timeToMaturity: T,
      optionType: 'call',
      params: { ...defaultParams, alpha: 1.98 },
    });

    // In Carr & Wu (2004), the characteristic exponent at alpha=2 equals -(sigma*u)^2 / cos(pi) = (sigma*u)^2,
    // which corresponds to Brownian motion variance parameter sigma_BS = sigma * sqrt(2).
    const bsPrice = CarrWuMath.blackScholesPrice(
      spot,
      strike,
      T,
      defaultParams.sigma * Math.SQRT2,
      defaultParams.rate,
      defaultParams.dividendYield,
      'call',
    );

    // Difference between FMLS near-Gaussian limit and equivalent Black-Scholes is small (< 5%)
    expect(Math.abs(fmlsNearGaussian.price - bsPrice) / bsPrice).toBeLessThan(0.05);
  });

  it('generates asymmetric implied volatility smile (left-skewed)', () => {
    const engine = new CarrWuEngine();
    const spot = 100;
    const strikes = [80, 90, 100, 110, 120];
    const smile = engine.generateSmile(spot, strikes, 0.5, defaultParams);

    expect(smile.length).toBe(5);
    // Lower strikes should exhibit higher implied vol due to maximal negative asymmetry (beta = -1)
    const lowStrikeIV = smile[0]!.impliedVol;
    const highStrikeIV = smile[4]!.impliedVol;
    expect(lowStrikeIV).toBeGreaterThan(highStrikeIV);
  });
});
