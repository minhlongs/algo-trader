import { describe, it, expect } from 'vitest';
import { GoldmanSosinEngine } from '../../../../src/desk/goldmansosin/goldman-sosin-engine';
import { GoldmanSosinMath } from '../../../../src/desk/goldmansosin/goldman-sosin-math';

describe('GoldmanSosinEngine — Lookback Option Pricing Suite', () => {
  it('prices standard floating lookback call and put with positive premium', () => {
    const res = GoldmanSosinEngine.calculate({
      spot: 100,
      runningMin: 95,
      runningMax: 105,
      riskFreeRate: 0.05,
      volatility: 0.25,
      timeToExpiry: 0.5,
    });

    expect(res.floatingCall).toBeGreaterThan(0.0);
    expect(res.floatingPut).toBeGreaterThan(0.0);
    expect(res.floatingCall).toBeGreaterThan(100 - 95); // Greater than intrinsic value
    expect(res.floatingPut).toBeGreaterThan(105 - 100);
  });

  it('correctly handles zero cost-of-carry singularity (r = q)', () => {
    const resZeroB = GoldmanSosinEngine.calculate({
      spot: 100,
      runningMin: 100,
      runningMax: 100,
      riskFreeRate: 0.04,
      dividendYield: 0.04,
      volatility: 0.2,
      timeToExpiry: 1.0,
    });

    expect(resZeroB.costOfCarry).toBeCloseTo(0.0, 6);
    expect(resZeroB.floatingCall).toBeGreaterThan(10.0);
    expect(resZeroB.floatingPut).toBeGreaterThan(10.0);
    expect(Number.isFinite(resZeroB.floatingCall)).toBe(true);
    expect(Number.isFinite(resZeroB.floatingPut)).toBe(true);
  });

  it('verifies monotonicity of floating call with respect to volatility', () => {
    const lowVol = GoldmanSosinEngine.calculate({
      spot: 100,
      runningMin: 100,
      riskFreeRate: 0.05,
      volatility: 0.15,
      timeToExpiry: 1.0,
    });
    const highVol = GoldmanSosinEngine.calculate({
      spot: 100,
      runningMin: 100,
      riskFreeRate: 0.05,
      volatility: 0.35,
      timeToExpiry: 1.0,
    });

    expect(highVol.floatingCall).toBeGreaterThan(lowVol.floatingCall);
    expect(lowVol.greeks.vega).toBeGreaterThan(0.0);
  });

  it('verifies extrema sensitivity is negative for running minimum in call', () => {
    const res = GoldmanSosinEngine.calculate({
      spot: 100,
      runningMin: 90,
      riskFreeRate: 0.05,
      volatility: 0.2,
      timeToExpiry: 0.5,
    });

    // Increasing the running min decreases the payoff (S_T - m), so dC/dm <= 0
    expect(res.greeks.extremaSensitivity).toBeLessThan(0.0);
  });

  it('throws descriptive error on invalid boundary inputs', () => {
    expect(() =>
      GoldmanSosinEngine.calculate({
        spot: 100,
        runningMin: 110, // Invalid: m > S
        riskFreeRate: 0.05,
        volatility: 0.2,
        timeToExpiry: 1.0,
      })
    ).toThrow('Running minimum cannot exceed spot price');

    expect(() =>
      GoldmanSosinEngine.calculate({
        spot: 100,
        runningMax: 90, // Invalid: M < S
        riskFreeRate: 0.05,
        volatility: 0.2,
        timeToExpiry: 1.0,
      })
    ).toThrow('Running maximum cannot be less than spot price');
  });
});
