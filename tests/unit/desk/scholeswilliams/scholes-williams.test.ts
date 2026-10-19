import { describe, it, expect } from 'vitest';
import { ScholesWilliamsEngine } from '../../../../src/desk/scholeswilliams';

describe('Scholes-Williams (1977) Non-Synchronous Beta Suite', () => {
  it('recovers true beta under synchronous trading', () => {
    let seed = 123456789;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const n = 800;
    const marketReturns: number[] = [];
    const assetReturns: number[] = [];
    const trueBeta = 1.25;

    for (let i = 0; i < n; i++) {
      const u1 = rand() + 1e-6;
      const u2 = rand();
      const rm = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.02;
      const noise = (rand() - 0.5) * 0.002;
      marketReturns.push(rm);
      assetReturns.push(trueBeta * rm + noise);
    }

    const engine = new ScholesWilliamsEngine();
    const result = engine.estimate({ assetReturns, marketReturns });

    expect(Math.abs(result.betaScholesWilliams - trueBeta)).toBeLessThan(0.08);
    expect(Math.abs(result.betaOls - trueBeta)).toBeLessThan(0.08);
    expect(Math.abs(result.biasOlsPct)).toBeLessThan(6.0);
  });

  it('corrects downward OLS bias caused by lagged non-synchronous observations', () => {
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const n = 1000;
    const marketReturns: number[] = [];
    const assetReturns: number[] = [];
    const trueBeta = 1.5;

    for (let i = 0; i < n; i++) {
      const u1 = rand() + 1e-6;
      const u2 = rand();
      const rm = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.02;
      marketReturns.push(rm);
    }

    // Asset trades infrequently and incorporates market info with a 1-period lag
    // R_{i,t} = 0.4 * beta * R_{m,t} + 0.6 * beta * R_{m,t-1}
    assetReturns.push(0);
    for (let i = 1; i < n; i++) {
      assetReturns.push(0.4 * trueBeta * marketReturns[i]! + 0.6 * trueBeta * marketReturns[i - 1]!);
    }

    const engine = new ScholesWilliamsEngine();
    const result = engine.estimate({ assetReturns, marketReturns });

    // OLS beta is severely attenuated (~0.4 * trueBeta = 0.6)
    expect(result.betaOls).toBeLessThan(result.betaScholesWilliams);
    // Scholes-Williams beta captures both contemporaneous and lagged covariances
    expect(Math.abs(result.betaScholesWilliams - trueBeta)).toBeLessThan(0.15);
    expect(result.lagBetas.betaLagMinus1).toBeGreaterThan(0.5);
  });

  it('computes market autocorrelation and standard error correctly', () => {
    const n = 100;
    const marketReturns: number[] = [];
    const assetReturns: number[] = [];

    for (let i = 0; i < n; i++) {
      marketReturns.push(Math.cos(i * 0.2) * 0.015);
      assetReturns.push(Math.cos(i * 0.2) * 0.015);
    }

    const engine = new ScholesWilliamsEngine();
    const result = engine.estimate({ assetReturns, marketReturns });

    expect(Number.isFinite(result.marketAutocorrelation)).toBe(true);
    expect(result.standardError).toBeGreaterThan(0);
    expect(Number.isFinite(result.tStatisticBeta1)).toBe(true);
    expect(result.sampleSize).toBe(n - 2);
  });

  it('throws descriptive error on insufficient sample size', () => {
    const engine = new ScholesWilliamsEngine();
    expect(() => engine.estimate({ assetReturns: [0.01, 0.02], marketReturns: [0.01, 0.02] })).toThrow(
      'Insufficient observations',
    );
  });
});
