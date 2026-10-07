import { describe, it, expect } from 'vitest';
import { VolatilitySurfaceCalculator } from '../../../../src/desk/pricing/volatility-surface-calculator';
import type { BinaryOptionQuote, ImpliedVolPoint } from '../../../../src/desk/pricing/volatility-surface-types';

describe('VolatilitySurfaceCalculator', () => {
  const calc = new VolatilitySurfaceCalculator();

  it('accurately computes inverse normal CDF', () => {
    // Phi(0) = 0.5 -> inv(0.5) = 0
    expect(calc.inverseNormalCdf(0.5)).toBeCloseTo(0, 4);
    // Phi(1.96) ~= 0.975 -> inv(0.975) ~= 1.96
    expect(calc.inverseNormalCdf(0.975)).toBeCloseTo(1.96, 2);
    // Phi(-1.96) ~= 0.025 -> inv(0.025) ~= -1.96
    expect(calc.inverseNormalCdf(0.025)).toBeCloseTo(-1.96, 2);
  });

  it('inverts implied volatility for binary options', () => {
    // S = 100, K = 100, T = 1.0, r = 0, p = 0.40
    // d2 = invNorm(0.4) ~= -0.2533
    // 0.5 * 1 * sigma^2 - 0.2533 * sigma = 0 => sigma ~= 2 * 0.2533 = 0.5066
    const quote: BinaryOptionQuote = {
      strike: 100,
      spotPrice: 100,
      timeToExpiryYears: 1.0,
      riskFreeRate: 0,
      binaryPrice: 0.40,
    };

    const iv = calc.invertBinaryImpliedVol(quote);
    expect(iv).not.toBeNull();
    expect(iv!).toBeGreaterThan(0.4);
    expect(iv!).toBeLessThan(0.6);
  });

  it('returns null for invalid or non-inverting quotes', () => {
    expect(calc.invertBinaryImpliedVol({
      strike: 0,
      spotPrice: 100,
      timeToExpiryYears: 1,
      riskFreeRate: 0,
      binaryPrice: 0.5,
    })).toBeNull();

    expect(calc.invertBinaryImpliedVol({
      strike: 100,
      spotPrice: 100,
      timeToExpiryYears: 0,
      riskFreeRate: 0,
      binaryPrice: 0.5,
    })).toBeNull();
  });

  it('fits quadratic polynomial smile across moneyness points', () => {
    // sigma(m) = 0.30 - 0.10*m + 0.50*m^2
    const points: ImpliedVolPoint[] = [
      { strike: 90, moneyness: -0.1, impliedVol: 0.30 - 0.10 * (-0.1) + 0.50 * 0.01, timeToExpiryYears: 0.5 },
      { strike: 100, moneyness: 0.0, impliedVol: 0.30, timeToExpiryYears: 0.5 },
      { strike: 110, moneyness: 0.1, impliedVol: 0.30 - 0.10 * 0.1 + 0.50 * 0.01, timeToExpiryYears: 0.5 },
    ];

    const fit = calc.fitSmile(points);
    expect(fit.a).toBeCloseTo(0.30, 3);
    expect(fit.b).toBeCloseTo(-0.10, 3);
    expect(fit.c).toBeCloseTo(0.50, 3);
    expect(fit.rSquared).toBeGreaterThan(0.99);
  });

  it('constructs a multi-expiry surface grid', () => {
    const quotes: BinaryOptionQuote[] = [
      { strike: 95, spotPrice: 100, timeToExpiryYears: 0.25, riskFreeRate: 0.02, binaryPrice: 0.48 },
      { strike: 100, spotPrice: 100, timeToExpiryYears: 0.25, riskFreeRate: 0.02, binaryPrice: 0.45 },
      { strike: 105, spotPrice: 100, timeToExpiryYears: 0.25, riskFreeRate: 0.02, binaryPrice: 0.42 },
      { strike: 100, spotPrice: 100, timeToExpiryYears: 0.50, riskFreeRate: 0.02, binaryPrice: 0.46 },
    ];

    const grid = calc.buildSurfaceGrid(quotes, 100, 0.02);
    expect(grid.smilesByExpiry.size).toBe(2);
    expect(grid.smilesByExpiry.has(0.25)).toBe(true);
    expect(grid.smilesByExpiry.has(0.50)).toBe(true);
  });
});
