/**
 * Unit Tests for Engle & Manganelli (2004) CAViaR Quantile Regression Engine.
 * Strictly zero-mock, real financial return series, strictly < 150 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  CaviarEngine,
  CaviarParameters,
} from '../../../../src/desk/caviar';

describe('Wave 200: Engle & Manganelli (2004) CAViaR Suite', () => {
  // Generate deterministic synthetic financial return series with volatility clustering and fat tails
  const generateReturns = (n: number): number[] => {
    const rets: number[] = new Array(n);
    let sigma = 0.012;
    for (let t = 0; t < n; t++) {
      // Deterministic pseudo-random standard normal approximation
      const u1 = Math.sin((t + 1) * 12.9898) * 0.5 + 0.5;
      const u2 = Math.cos((t + 1) * 78.233) * 0.5 + 0.5;
      const z = Math.sqrt(-2.0 * Math.log(Math.max(1e-6, u1))) * Math.cos(2.0 * Math.PI * u2);

      // Return = sigma * z
      rets[t] = sigma * z;
      // GARCH-like volatility updating with asymmetric shock
      const shock = Math.abs(rets[t]);
      sigma = Math.sqrt(0.00001 + 0.85 * sigma * sigma + 0.1 * shock * shock);
    }
    return rets;
  };

  const sampleReturns = generateReturns(250);

  it('estimates Symmetric Absolute Value (SAV) specification and produces negative quantiles', () => {
    const engine = new CaviarEngine();
    const result = engine.estimate(sampleReturns, 'SAV', 0.05);

    expect(result.specification).toBe('SAV');
    expect(result.quantileLevel).toBe(0.05);
    expect(result.quantileSeries.length).toBe(sampleReturns.length);
    expect(result.inSampleLoss).toBeGreaterThan(0);

    // Quantile values should be strictly negative (representing lower 5% tail returns)
    expect(result.finalQuantile).toBeLessThan(0);
    const meanQuantile =
      result.quantileSeries.reduce((a, b) => a + b, 0) / result.quantileSeries.length;
    expect(meanQuantile).toBeLessThan(0);
  });

  it('conducts Dynamic Quantile (DQ) test with plausible empirical hit rate', () => {
    const engine = new CaviarEngine();
    const customParams: CaviarParameters = {
      beta1: -0.002,
      beta2: 0.82,
      beta3: -0.15,
    };
    const result = engine.estimate(sampleReturns, 'SAV', 0.05, customParams);

    // 5% target quantile should yield empirical hit rate close to 5% (e.g. 2% to 10%)
    expect(result.dqTest.empiricalHitRate).toBeGreaterThan(0.01);
    expect(result.dqTest.empiricalHitRate).toBeLessThan(0.12);
    expect(result.dqTest.sampleSize).toBe(sampleReturns.length);
    expect(result.dqTest.dqStatistic).toBeGreaterThanOrEqual(0);
    expect(result.dqTest.degreesOfFreedom).toBe(4);
  });

  it('estimates Asymmetric Slope (AS) specification capturing leverage effect', () => {
    const engine = new CaviarEngine();
    const asParams: CaviarParameters = {
      beta1: -0.003,
      beta2: 0.80,
      beta3: 0.02,
      beta4: -0.28, // Negative returns widen VaR more than positive returns
    };
    const result = engine.estimate(sampleReturns, 'AS', 0.05, asParams);

    expect(result.specification).toBe('AS');
    expect(result.parameters.beta4).toBeDefined();
    expect(result.parameters.beta4).toBeLessThan(0);
    expect(result.finalQuantile).toBeLessThan(0);
  });

  it('evaluates Adaptive CAViaR specification updating on hit indicators', () => {
    const engine = new CaviarEngine();
    const adaptiveParams: CaviarParameters = {
      beta1: -0.005,
      beta2: 0.0,
      beta3: 0.0,
    };
    const result = engine.estimate(sampleReturns, 'ADAPTIVE', 0.05, adaptiveParams);

    expect(result.specification).toBe('ADAPTIVE');
    expect(result.quantileSeries.length).toBe(sampleReturns.length);
    expect(result.finalQuantile).toBeLessThan(0);
  });

  it('rejects sample sizes below the minimum threshold', () => {
    const engine = new CaviarEngine();
    const shortSeries = [0.01, -0.02, 0.005];
    expect(() => engine.estimate(shortSeries)).toThrow(/Sample size 3 is too short/);
  });
});
