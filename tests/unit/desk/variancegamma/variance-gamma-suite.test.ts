import { describe, expect, it } from 'vitest';
import { VarianceGammaEngine } from '../../../../src/desk/variancegamma/variance-gamma-engine';
import { VarianceGammaParams } from '../../../../src/desk/variancegamma/variance-gamma-types';

describe('Variance Gamma Option Pricing Suite (Desk 112)', () => {
  const baseParams: VarianceGammaParams = {
    spotPrice: 100,
    strikePrice: 100,
    timeToMaturity: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    sigma: 0.20,         // 20% diffusion vol
    nu: 0.20,            // Kurtosis / variance rate
    theta: -0.10,        // Negative skewness drift
    isCall: true,
  };

  it('should price European Call with positive value', () => {
    const result = VarianceGammaEngine.calculate(baseParams);

    expect(result.price).toBeGreaterThan(0.0);
    expect(result.price).toBeGreaterThan(8.0);
    expect(result.price).toBeLessThan(15.0);
    expect(result.impliedBlackScholesVolEstimate).toBeGreaterThan(0.15);
    expect(result.skewnessCharacteristic).toBeLessThan(0.0); // Negative theta induces negative skew
    expect(result.excessKurtosisEstimate).toBeGreaterThan(0.0);
  });

  it('should satisfy Put-Call parity in Variance Gamma model', () => {
    const callResult = VarianceGammaEngine.calculate(baseParams);
    const putResult = VarianceGammaEngine.calculate({ ...baseParams, isCall: false });

    // C - P = S * exp(-q*T) - K * exp(-r*T)
    const expectedDiff = baseParams.spotPrice - baseParams.strikePrice * Math.exp(-baseParams.riskFreeRate * baseParams.timeToMaturity);
    const actualDiff = callResult.price - putResult.price;

    expect(actualDiff).toBeCloseTo(expectedDiff, 2);
  });

  it('should throw error when martingale condition is violated', () => {
    const invalidParams: VarianceGammaParams = {
      ...baseParams,
      theta: 2.0,
      nu: 1.0, // 1 - 2 - 0.5 * 0.04 * 1 < 0
    };

    expect(() => VarianceGammaEngine.calculate(invalidParams)).toThrow(/martingale condition violated/i);
  });
});
