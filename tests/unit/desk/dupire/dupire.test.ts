/**
 * Unit Tests for Dupire (1994) Continuous Local Volatility Surface.
 * Strictly zero-mock, real financial math, strictly < 180 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  DupireLocalVolEngine,
  DupireMarketParams,
  blackScholesCallPrice,
  computeDupireDerivatives,
} from '../../../../src/desk/dupire';

describe('Dupire (1994) Local Volatility Suite', () => {
  const marketParams: DupireMarketParams = {
    spot: 100.0,
    riskFreeRate: 0.05,
    dividendYield: 0.02,
  };

  it('verifies Black-Scholes call pricer and Dupire derivative consistency on flat vol', () => {
    const flatVol = 0.20;
    const callPricer = (k: number, t: number) =>
      blackScholesCallPrice(
        marketParams.spot,
        k,
        t,
        marketParams.riskFreeRate,
        marketParams.dividendYield,
        flatVol
      );

    const strike = 100.0;
    const expiry = 1.0;
    const deriv = computeDupireDerivatives(
      callPricer,
      strike,
      expiry,
      marketParams.riskFreeRate,
      marketParams.dividendYield
    );

    expect(deriv.d2CdK2).toBeGreaterThan(0);
    expect(deriv.numerator).toBeGreaterThan(0);
    expect(deriv.denominator).toBeGreaterThan(0);

    // In flat Black-Scholes, local variance = flatVol^2 = 0.04
    const localVariance = deriv.numerator / deriv.denominator;
    expect(localVariance).toBeCloseTo(flatVol * flatVol, 2);
  });

  it('calibrates flat volatility surface and yields flat local volatility', () => {
    const engine = new DupireLocalVolEngine(marketParams);
    const flatVol = 0.25;
    const volSurface = (_k: number, _t: number) => flatVol;

    const strikes = [90, 95, 100, 105, 110];
    const expiries = [0.25, 0.5, 1.0];

    const result = engine.calibrateFromVolSurface(volSurface, strikes, expiries);

    expect(result.isArbitrageFree).toBe(true);
    expect(result.violations.length).toBe(0);
    expect(result.points.length).toBe(strikes.length * expiries.length);

    // All points should have local vol approximately equal to 0.25
    for (const pt of result.points) {
      expect(pt.localVol).toBeCloseTo(flatVol, 1);
      expect(pt.hasArbitrage).toBe(false);
      expect(pt.riskNeutralDensity).toBeGreaterThan(0);
    }
  });

  it('calibrates realistic equity volatility skew surface', () => {
    const engine = new DupireLocalVolEngine(marketParams);
    // Skew model: vol decreases as strike increases
    const skewSurface = (k: number, t: number) => {
      const moneyness = Math.log(k / marketParams.spot);
      return Math.max(0.08, 0.22 - 0.15 * moneyness + 0.03 * Math.sqrt(t));
    };

    const strikes = [85, 90, 100, 110, 115];
    const expiries = [0.5, 1.0, 1.5];

    const result = engine.calibrateFromVolSurface(skewSurface, strikes, expiries);

    expect(result.points.length).toBe(15);
    expect(result.minLocalVol).toBeGreaterThan(0.05);
    expect(result.maxLocalVol).toBeLessThan(1.0);
    expect(result.meanLocalVol).toBeGreaterThan(0.1);
  });

  it('detects butterfly arbitrage when second derivative is negative', () => {
    const engine = new DupireLocalVolEngine(marketParams);
    // Pathological non-convex call surface violating butterfly spread:
    // C(K) has negative second derivative locally
    const concaveCallPricer = (k: number, _t: number) => {
      // Linear or concave function in K creates d2C/dK2 <= 0
      return Math.max(0, 150 - 1.2 * k);
    };

    const strikes = [90, 100, 110];
    const expiries = [1.0];

    const result = engine.calibrateFromCallPricer(concaveCallPricer, strikes, expiries);

    expect(result.isArbitrageFree).toBe(false);
    expect(result.violations.some((v) => v.type === 'BUTTERFLY_DENSITY')).toBe(true);
  });

  it('detects calendar spread arbitrage when price decreases across time', () => {
    const engine = new DupireLocalVolEngine(marketParams);
    // Decreasing with time: violates calendar spread condition
    const decayingCallPricer = (k: number, t: number) => {
      return Math.max(0, 100 - 0.8 * k) * Math.exp(-0.5 * t);
    };

    const strikes = [100];
    const expiries = [1.0];

    const result = engine.calibrateFromCallPricer(decayingCallPricer, strikes, expiries);

    expect(result.isArbitrageFree).toBe(false);
    expect(
      result.violations.some(
        (v) => v.type === 'CALENDAR_SPREAD' || v.type === 'NEGATIVE_VARIANCE'
      )
    ).toBe(true);
  });
});
