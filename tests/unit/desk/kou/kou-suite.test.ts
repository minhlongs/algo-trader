/**
 * Kou (2002) Jump-Diffusion Model Test Suite
 */

import { describe, it, expect } from 'vitest';
import { KouEngine, KouMath, type KouConfig } from '../../../../src/desk/kou';

describe('Kou (2002) Jump-Diffusion Suite', () => {
  const baseConfig: KouConfig = {
    spot: 100,
    strike: 100,
    maturity: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.01,
    volatility: 0.20,
    jumpIntensity: 0.5,
    pUp: 0.4,
    eta1: 10,  // Upward jumps decay with rate 10
    eta2: 5,   // Downward jumps decay with rate 5 (heavier downward tail)
  };

  it('validates configuration constraints properly', () => {
    expect(() => new KouEngine({ ...baseConfig, spot: -1 })).toThrow();
    expect(() => new KouEngine({ ...baseConfig, strike: 0 })).toThrow();
    expect(() => new KouEngine({ ...baseConfig, maturity: -0.5 })).toThrow();
    expect(() => new KouEngine({ ...baseConfig, volatility: -0.1 })).toThrow();
    expect(() => new KouEngine({ ...baseConfig, eta1: 0.9 })).toThrow(); // must be > 1
    expect(() => new KouEngine({ ...baseConfig, eta2: -1 })).toThrow();
    expect(() => new KouEngine({ ...baseConfig, pUp: 1.5 })).toThrow();
  });

  it('calculates mean relative jump size zeta accurately', () => {
    // p=0.4, eta1=10, eta2=5, q=0.6
    // Term 1: 0.4 * 10 / 9 = 4 / 9 ≈ 0.444444
    // Term 2: 0.6 * 5 / 6 = 3 / 6 = 0.5
    // zeta = 4/9 + 0.5 - 1 = 4/9 - 0.5 = 4/9 - 4.5/9 = -0.5/9 ≈ -0.055555
    const zeta = KouMath.computeMeanRelativeJump(0.4, 10, 5);
    expect(zeta).toBeCloseTo(-0.5 / 9, 6);
  });

  it('prices call and put satisfying Put-Call Parity', () => {
    const engine = new KouEngine(baseConfig);
    const callRes = engine.price(true);
    const putRes = engine.price(false);

    // Parity: C - P = S * e^(-qT) - K * e^(-rT)
    const dfDiv = Math.exp(-0.01 * 1.0);
    const dfRf = Math.exp(-0.05 * 1.0);
    const expectedDifference = 100 * dfDiv - 100 * dfRf;
    const actualDifference = callRes.price - putRes.price;

    expect(actualDifference).toBeCloseTo(expectedDifference, 3);
    expect(callRes.delta).toBeGreaterThan(0);
    expect(callRes.delta).toBeLessThan(1);
    expect(callRes.gamma).toBeGreaterThan(0);
  });

  it('computes asymmetric moments with negative skewness when downward tail dominates', () => {
    const engine = new KouEngine(baseConfig);
    const moments = engine.getMoments();

    // Since eta1=10 (lighter upper tail) and eta2=5 (heavier lower tail),
    // and q=0.6 > p=0.4, skewness should be negative!
    expect(moments.variance).toBeGreaterThan(0);
    expect(moments.skewness).toBeLessThan(0);
    expect(moments.excessKurtosis).toBeGreaterThan(0);
  });

  it('reduces to Black-Scholes pricing when jump intensity lambda = 0', () => {
    const bsConfig: KouConfig = {
      ...baseConfig,
      jumpIntensity: 0,
      dividendYield: 0,
    };
    const engine = new KouEngine(bsConfig);
    const call = engine.price(true);

    // Analytical BS formula for S=100, K=100, r=0.05, sigma=0.20, T=1
    // d1 = (ln(1) + (0.05 + 0.02) * 1) / 0.2 = 0.07 / 0.2 = 0.35
    // d2 = 0.35 - 0.20 = 0.15
    // N(0.35) ≈ 0.63683, N(0.15) ≈ 0.55962
    // C = 100 * 0.63683 - 100 * exp(-0.05) * 0.55962 ≈ 63.683 - 53.232 ≈ 10.45
    expect(call.price).toBeCloseTo(10.45, 1);
  });
});
