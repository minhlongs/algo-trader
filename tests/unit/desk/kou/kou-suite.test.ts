import { describe, expect, it } from 'vitest';
import { KouCharFn } from '../../../../src/desk/kou/kou-char-fn';
import { KouEngine } from '../../../../src/desk/kou/kou-engine';
import { KouModelParameters, KouOptionSpec } from '../../../../src/desk/kou/kou-types';

describe('Kou (2002) Double Exponential Jump Suite (Desk 95)', () => {
  const engine = new KouEngine();

  const standardParams: KouModelParameters = {
    sigma: 0.15,
    lambda: 1.0,  // 1 jump expected per year
    p: 0.4,       // 40% probability of upward jump
    eta1: 10.0,   // average upward jump size = 1 / 10 = 0.10 (10%)
    eta2: 5.0,    // average downward jump size = 1 / 5 = 0.20 (20%)
  };

  const standardSpec: KouOptionSpec = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 1.0,
    riskFreeRatePct: 5.0,
    dividendYieldPct: 1.0,
    isCall: true,
  };

  it('should compute jump moments and characteristic function accurately', () => {
    const moments = KouCharFn.calculateJumpMoments(standardParams);

    // Mean Y = 0.4 / 10 - 0.6 / 5 = 0.04 - 0.12 = -0.08
    expect(moments.meanJumpSize).toBeCloseTo(-0.08, 4);
    expect(moments.varianceJumpSize).toBeGreaterThan(0.0);

    const charVal = KouCharFn.evaluateCharacteristicFunction(
      1.0,
      standardParams,
      100.0,
      1.0,
      0.05,
      0.01
    );

    expect(Number.isFinite(charVal.re)).toBe(true);
    expect(Number.isFinite(charVal.im)).toBe(true);
  });

  it('should price European call and put options conforming to Put-Call Parity', () => {
    const callRes = engine.priceOption(standardParams, standardSpec);
    const putRes = engine.priceOption(standardParams, { ...standardSpec, isCall: false });

    expect(callRes.optionPrice).toBeGreaterThan(0.0);
    expect(putRes.optionPrice).toBeGreaterThan(0.0);
    expect(callRes.optionPrice).toBeGreaterThanOrEqual(callRes.intrinsicValue);
    expect(putRes.optionPrice).toBeGreaterThanOrEqual(putRes.intrinsicValue);

    // Put-Call Parity check: C - P = S*exp(-q*T) - K*exp(-r*T)
    const S = standardSpec.spotPrice;
    const K = standardSpec.strikePrice;
    const T = standardSpec.timeToExpiryYears;
    const r = standardSpec.riskFreeRatePct / 100.0;
    const q = (standardSpec.dividendYieldPct || 0.0) / 100.0;
    const expectedDiff = S * Math.exp(-q * T) - K * Math.exp(-r * T);

    const actualDiff = callRes.optionPrice - putRes.optionPrice;
    expect(actualDiff).toBeCloseTo(expectedDiff, 2);
  });

  it('should throw on invalid parameters violating stability conditions', () => {
    expect(() =>
      KouCharFn.validateParameters({
        ...standardParams,
        eta1: 0.5, // Violates eta1 > 1 condition
      })
    ).toThrow('eta1 must be strictly greater than 1');

    expect(() =>
      KouCharFn.validateParameters({
        ...standardParams,
        p: 1.5,
      })
    ).toThrow('Probability p must be in (0, 1)');

    expect(() =>
      engine.priceOption(standardParams, { ...standardSpec, spotPrice: -50 })
    ).toThrow('Spot and strike prices must be positive');
  });
});
