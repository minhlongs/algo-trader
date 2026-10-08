import { describe, expect, it } from 'vitest';
import { HoLeeEngine } from '../../../../src/desk/holee/ho-lee-engine';
import { HoLeeModelParameters, HoLeeOptionTerms } from '../../../../src/desk/holee/ho-lee-types';

describe('HoLeeEngine Suite (Desk 78)', () => {
  const engine = new HoLeeEngine();

  const standardParams: HoLeeModelParameters = {
    initialShortRateR0: 0.04,   // 4% initial short rate
    volatilitySigma: 0.015,     // 1.5% volatility
    driftTheta: 0.001,          // 0.1% drift
  };

  it('should price zero-coupon bond and calculate yield and forward rates', () => {
    const bond = engine.priceZeroCouponBond(standardParams, 5.0, 100.0);

    expect(bond.maturityYears).toBe(5.0);
    expect(bond.bondPriceUsd).toBeGreaterThan(70.0);
    expect(bond.bondPriceUsd).toBeLessThan(100.0);
    expect(bond.yieldPct).toBeGreaterThan(3.0);
    expect(bond.yieldPct).toBeLessThan(6.0);
    expect(bond.instantaneousForwardRatePct).toBeGreaterThan(0.0);
  });

  it('should price European bond options and satisfy put-call parity', () => {
    const terms: HoLeeOptionTerms = {
      optionExpiryYears: 1.0,   // Option expires in 1 year
      bondMaturityYears: 5.0,   // Underlying bond matures in 5 years
      strikePriceUsd: 80.0,     // Strike price 80 USD
    };

    const result = engine.priceBondOption(standardParams, terms, 100.0);

    expect(result.callPriceUsd).toBeGreaterThan(0.0);
    expect(result.putPriceUsd).toBeGreaterThan(0.0);
    expect(result.forwardBondPriceUsd).toBeGreaterThan(0.0);
    expect(result.volatilitySigmaP).toBeGreaterThan(0.0);

    // Put-Call Parity: C - P = P(0, S) - K * P(0, T)
    const pS = engine.priceZeroCouponBond(standardParams, terms.bondMaturityYears, 100.0).bondPriceUsd;
    const pT = engine.priceZeroCouponBond(standardParams, terms.optionExpiryYears, 100.0).bondPriceUsd / 100.0;
    const parityRhs = pS - terms.strikePriceUsd * pT;
    const optionDiff = result.callPriceUsd - result.putPriceUsd;

    expect(Math.abs(optionDiff - parityRhs)).toBeLessThan(0.01);
  });

  it('should throw on invalid maturity parameters', () => {
    expect(() => engine.priceZeroCouponBond(standardParams, -1.0)).toThrow('Maturity must be positive');
    expect(() =>
      engine.priceBondOption(standardParams, {
        optionExpiryYears: 5.0,
        bondMaturityYears: 3.0,
        strikePriceUsd: 80.0,
      })
    ).toThrow('Option expiry must be positive and less than bond maturity');
  });
});
