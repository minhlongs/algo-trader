import { describe, it, expect } from 'vitest';
import { HullWhiteAnalyticalEngine } from '../../../../src/desk/hullwhite/hullwhite-engine.js';
import { HullWhiteModelParams, EuropeanBondOptionParams } from '../../../../src/desk/hullwhite/hullwhite-types.js';

describe('HullWhiteAnalyticalEngine (1990 Short-Rate & Bond Options)', () => {
  const model: HullWhiteModelParams = {
    meanReversion: 0.1,
    volatility: 0.015,
    currentShortRate: 0.03,
  };

  it('validates model and option parameters correctly', () => {
    expect(() => HullWhiteAnalyticalEngine.validateModel({ ...model, meanReversion: -0.1 })).toThrow();
    expect(() => HullWhiteAnalyticalEngine.validateModel({ ...model, volatility: 0 })).toThrow();
    expect(() => HullWhiteAnalyticalEngine.priceBond(model, { maturity: 0 })).toThrow();
    expect(() => HullWhiteAnalyticalEngine.priceBondOption(model, {
      optionMaturity: 2,
      bondMaturity: 1, // Invalid: bond maturity must exceed option maturity
      strikePrice: 0.9,
      isCall: true,
    })).toThrow();
  });

  it('prices Zero Coupon Bonds with proper discount curve curvature', () => {
    const bond1Y = HullWhiteAnalyticalEngine.priceBond(model, { maturity: 1.0 });
    const bond5Y = HullWhiteAnalyticalEngine.priceBond(model, { maturity: 5.0 });
    const bond10Y = HullWhiteAnalyticalEngine.priceBond(model, { maturity: 10.0 });

    expect(bond1Y.bondPrice).toBeLessThan(1.0);
    expect(bond1Y.bondPrice).toBeGreaterThan(bond5Y.bondPrice);
    expect(bond5Y.bondPrice).toBeGreaterThan(bond10Y.bondPrice);

    expect(bond1Y.yieldToMaturity).toBeGreaterThan(0.01);
    expect(bond10Y.yieldToMaturity).toBeGreaterThan(0.01);
  });

  it('prices European call and put options on zero coupon bonds correctly', () => {
    const optionParams: EuropeanBondOptionParams = {
      optionMaturity: 1.0,
      bondMaturity: 5.0,
      strikePrice: 0.88,
      isCall: true,
    };

    const callResult = HullWhiteAnalyticalEngine.priceBondOption(model, optionParams);
    const putResult = HullWhiteAnalyticalEngine.priceBondOption(model, { ...optionParams, isCall: false });

    expect(callResult.optionPrice).toBeGreaterThan(0);
    expect(putResult.optionPrice).toBeGreaterThan(0);
    expect(callResult.optionVolatility).toBeGreaterThan(0);

    // Call-Put Parity on European Bond Option:
    // C - P = P(0, S) - K * P(0, T)
    const pS = HullWhiteAnalyticalEngine.priceBond(model, { maturity: optionParams.bondMaturity }).bondPrice;
    const pT = HullWhiteAnalyticalEngine.priceBond(model, { maturity: optionParams.optionMaturity }).bondPrice;
    const parityDiff = callResult.optionPrice - putResult.optionPrice;
    const expectedDiff = pS - optionParams.strikePrice * pT;
    expect(Math.abs(parityDiff - expectedDiff)).toBeLessThan(1e-10);
  });

  it('computes sensitivity Greeks to interest rate and volatility', () => {
    const optionParams: EuropeanBondOptionParams = {
      optionMaturity: 0.5,
      bondMaturity: 2.0,
      strikePrice: 0.95,
      isCall: true,
    };

    const result = HullWhiteAnalyticalEngine.priceBondOption(model, optionParams, true);
    const { deltaRate, gammaRate, vega } = result.greeks;

    // As rates rise, bond prices fall, so call on bond should have negative rate delta
    expect(deltaRate).toBeLessThan(0);
    expect(gammaRate).toBeGreaterThan(0);
    expect(vega).toBeGreaterThan(0);
  });
});
