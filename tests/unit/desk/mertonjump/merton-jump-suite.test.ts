import { describe, it, expect } from 'vitest';
import { MertonJumpEngine } from '../../../../src/desk/mertonjump/merton-jump-engine';

describe('MertonJumpEngine — Poisson Jump-Diffusion Option Engine Suite', () => {
  it('collapses exactly to Black-Scholes when jump intensity is zero', () => {
    const res = MertonJumpEngine.calculate({
      spot: 100.0,
      strike: 100.0,
      timeToExpiry: 1.0,
      riskFreeRate: 0.05,
      volatility: 0.2,
      jumpIntensity: 0.0,
      jumpMean: 0.0,
      jumpVol: 0.0,
    });

    expect(res.callPrice).toBeCloseTo(res.bsBenchmarkCall, 5);
    expect(res.putPrice).toBeCloseTo(res.bsBenchmarkPut, 5);
    expect(res.jumpComponentCall).toBeCloseTo(0.0, 5);
  });

  it('demonstrates fat-tail pricing premium for out-of-the-money options under jump risk', () => {
    const spot = 100.0;
    const strike = 125.0; // OTM call
    const res = MertonJumpEngine.calculate({
      spot,
      strike,
      timeToExpiry: 0.5,
      riskFreeRate: 0.05,
      volatility: 0.15,
      jumpIntensity: 1.0,
      jumpMean: -0.05,
      jumpVol: 0.3,
    });

    expect(res.callPrice).toBeGreaterThan(res.bsBenchmarkCall);
    expect(res.jumpComponentCall).toBeGreaterThan(0.0);
    expect(res.expectedJumpSizeKappa).toBeDefined();
  });

  it('verifies Put-Call parity unconditionally holds under jump-diffusion', () => {
    const spot = 105.0;
    const strike = 95.0;
    const r = 0.04;
    const q = 0.02;
    const T = 0.75;

    const res = MertonJumpEngine.calculate({
      spot,
      strike,
      timeToExpiry: T,
      riskFreeRate: r,
      dividendYield: q,
      volatility: 0.22,
      jumpIntensity: 2.0,
      jumpMean: -0.1,
      jumpVol: 0.25,
    });

    const parityLhs = res.callPrice - res.putPrice;
    const parityRhs = spot * Math.exp(-q * T) - strike * Math.exp(-r * T);

    expect(parityLhs).toBeCloseTo(parityRhs, 4);
  });

  it('computes well-behaved Greeks for call options', () => {
    const res = MertonJumpEngine.calculate({
      spot: 100.0,
      strike: 100.0,
      timeToExpiry: 1.0,
      riskFreeRate: 0.05,
      volatility: 0.2,
      jumpIntensity: 0.8,
      jumpMean: 0.0,
      jumpVol: 0.15,
    });

    expect(res.greeks.delta).toBeGreaterThan(0.4);
    expect(res.greeks.delta).toBeLessThan(0.8);
    expect(res.greeks.gamma).toBeGreaterThan(0.0);
    expect(res.greeks.vega).toBeGreaterThan(0.0);
    expect(res.greeks.theta).toBeLessThan(0.0);
    expect(res.greeks.rho).toBeGreaterThan(0.0);
  });

  it('validates parameter constraints and throws on invalid inputs', () => {
    expect(() =>
      MertonJumpEngine.calculate({
        spot: -100,
        strike: 100,
        timeToExpiry: 1.0,
        riskFreeRate: 0.05,
        volatility: 0.2,
        jumpIntensity: 1.0,
        jumpMean: 0.0,
        jumpVol: 0.1,
      })
    ).toThrow('spot and strike must be strictly positive');

    expect(() =>
      MertonJumpEngine.calculate({
        spot: 100,
        strike: 100,
        timeToExpiry: 1.0,
        riskFreeRate: 0.05,
        volatility: -0.2,
        jumpIntensity: 1.0,
        jumpMean: 0.0,
        jumpVol: 0.1,
      })
    ).toThrow('timeToExpiry and volatility must be strictly positive');

    expect(() =>
      MertonJumpEngine.calculate({
        spot: 100,
        strike: 100,
        timeToExpiry: 1.0,
        riskFreeRate: 0.05,
        volatility: 0.2,
        jumpIntensity: -0.5,
        jumpMean: 0.0,
        jumpVol: 0.1,
      })
    ).toThrow('jumpIntensity and jumpVol must be non-negative');
  });
});
