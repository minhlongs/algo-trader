import { describe, expect, it } from 'vitest';
import { DupireEngine } from '../../../../src/desk/localvolatility/dupire-engine';
import { DupireLocalVolConfig, DupirePricingSurface } from '../../../../src/desk/localvolatility/dupire-types';

describe('Dupire (1994) Local Volatility Surface (Desk 99)', () => {
  // Simple Black-Scholes Vanilla Call analytic formula restricted for testing
  const normalCdf = (x: number): number => {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1.0 / (1.0 + (p * Math.abs(x)) / Math.SQRT2);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2.0);
    return 0.5 * (1.0 + sign * y);
  };

  const bsCall = (S: number, K: number, r: number, q: number, vol: number, T: number): number => {
    if (T <= 0) return Math.max(0, S - K);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * Math.sqrt(T));
    const d2 = d1 - vol * Math.sqrt(T);
    return S * Math.exp(-q * T) * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
  };

  const spot = 100.0;
  const flatVol = 0.25;
  const config: DupireLocalVolConfig = {
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    dK: 0.01,   // small bump
    dT: 0.0001, // small bump for high accuracy
  };

  const bsSurface: DupirePricingSurface = {
    priceCall: (strike: number, timeToEquity: number) => {
      return bsCall(spot, strike, config.riskFreeRate, config.dividendYield, flatVol, timeToEquity);
    },
  };

  it('should recover constant volatility from Black-Scholes generated surface', () => {
    const resultAtm = DupireEngine.calculateLocalVolatility(bsSurface, 100.0, 1.0, config);
    expect(resultAtm.localVolatility).toBeCloseTo(flatVol, 3);

    // Out of the money recovery
    const resultOtm = DupireEngine.calculateLocalVolatility(bsSurface, 120.0, 0.5, config);
    expect(resultOtm.localVolatility).toBeCloseTo(flatVol, 3);

    // In the money recovery
    const resultItm = DupireEngine.calculateLocalVolatility(bsSurface, 80.0, 2.0, config);
    expect(resultItm.localVolatility).toBeCloseTo(flatVol, 3);
  });

  it('should compute valid derivatives matching option Greeks properties', () => {
    const result = DupireEngine.calculateLocalVolatility(bsSurface, 100.0, 1.0, config);

    // d^2C/dK^2 should be related loosely to strike gamma, always positive for calls
    expect(result.secondDerivativeK).toBeGreaterThan(0.0);

    // dC/dK should be negative (as Strike increases, call price decreases)
    expect(result.firstDerivativeK).toBeLessThan(0.0);

    // dC/dT should typically be positive for zero dividend (theta with respect to T)
    expect(result.firstDerivativeT).toBeGreaterThan(0.0);
  });

  it('should handle arb-violating surfaces safely by capping variance at 0', () => {
    const arbSurface: DupirePricingSurface = {
      priceCall: (_strike: number, _time: number) => 10.0 // completely flat surface = 0 curvature
    };

    const result = DupireEngine.calculateLocalVolatility(arbSurface, 100.0, 1.0, config);
    expect(result.localVariance).toBe(0.0);
    expect(result.localVolatility).toBe(0.0);
  });
});
