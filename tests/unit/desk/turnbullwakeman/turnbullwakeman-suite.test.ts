import { describe, it, expect } from 'vitest';
import { TurnbullWakemanEngine } from '../../../../src/desk/turnbullwakeman/turnbullwakeman-engine.js';
import { TurnbullWakemanParams } from '../../../../src/desk/turnbullwakeman/turnbullwakeman-types.js';

describe('TurnbullWakemanEngine (1991 Arithmetic Asian Option)', () => {
  const baseParams: TurnbullWakemanParams = {
    spotPrice: 100,
    strikePrice: 100,
    timeToExpiry: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    volatility: 0.2,
    isCall: true,
  };

  it('validates parameters strictly', () => {
    expect(() => TurnbullWakemanEngine.price({ ...baseParams, spotPrice: -10 })).toThrow();
    expect(() => TurnbullWakemanEngine.price({ ...baseParams, strikePrice: 0 })).toThrow();
    expect(() => TurnbullWakemanEngine.price({ ...baseParams, timeToExpiry: -1 })).toThrow();
    expect(() => TurnbullWakemanEngine.price({ ...baseParams, volatility: 0 })).toThrow();
  });

  it('calculates Call option price, moments, and effective volatility correctly', () => {
    const res = TurnbullWakemanEngine.price(baseParams);

    // Asian option is cheaper than European vanilla (since averaging dampens volatility)
    expect(res.optionPrice).toBeGreaterThan(0);
    expect(res.optionPrice).toBeLessThan(10.45); // Black-Scholes call is ~10.45, Asian call is typically ~5.7 - 6.0
    expect(res.firstMoment).toBeGreaterThan(95);
    expect(res.secondMoment).toBeGreaterThan(res.firstMoment * res.firstMoment);
    expect(res.effectiveVol).toBeGreaterThan(0.05);
    expect(res.effectiveVol).toBeLessThan(0.20); // Effective vol of continuous average is ~ sigma / sqrt(3) ~ 0.115
  });

  it('calculates Put option price and satisfies Put-Call parity', () => {
    const callRes = TurnbullWakemanEngine.price({ ...baseParams, isCall: true });
    const putRes = TurnbullWakemanEngine.price({ ...baseParams, isCall: false });

    expect(putRes.optionPrice).toBeGreaterThan(0);
    expect(callRes.putCallParityDeviation).toBeLessThan(1e-10);
    expect(putRes.putCallParityDeviation).toBeLessThan(1e-10);

    // Direct check: Call - Put = e^(-rT) * (M1 - K)
    const df = Math.exp(-baseParams.riskFreeRate * baseParams.timeToExpiry);
    const theoreticalDiff = df * (callRes.firstMoment - baseParams.strikePrice);
    const actualDiff = callRes.optionPrice - putRes.optionPrice;
    expect(Math.abs(actualDiff - theoreticalDiff)).toBeLessThan(1e-10);
  });

  it('calculates Greeks with sensible signs and non-zero values', () => {
    const res = TurnbullWakemanEngine.price(baseParams, true);
    const { delta, gamma, vega, theta, rho } = res.greeks;

    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(1);
    expect(gamma).toBeGreaterThan(0);
    expect(vega).toBeGreaterThan(0);
    expect(theta).toBeLessThan(0); // time decay for long call
    expect(rho).toBeGreaterThan(0);
  });

  it('handles dividend yield and in-the-money / out-of-the-money regimes', () => {
    const itmCall = TurnbullWakemanEngine.price({ ...baseParams, spotPrice: 120, strikePrice: 90, dividendYield: 0.02 });
    const otmCall = TurnbullWakemanEngine.price({ ...baseParams, spotPrice: 80, strikePrice: 110, dividendYield: 0.02 });

    expect(itmCall.optionPrice).toBeGreaterThan(otmCall.optionPrice);
    expect(itmCall.optionPrice).toBeGreaterThan(20);
  });
});
