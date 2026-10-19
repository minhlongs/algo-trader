import { describe, it, expect } from 'vitest';
import { HoLeeEngine } from '../../../../src/desk/holee/holee-engine.js';
import { HoLeeParams, HoLeeOptionParams } from '../../../../src/desk/holee/holee-types.js';

describe('Ho-Lee (1986) Arbitrage-Free Term Structure Suite', () => {
  const baseParams: HoLeeParams = {
    shortRate: 0.04,
    rateVolatility: 0.015,
  };

  it('validates parameters and rejects non-positive volatility or maturity', () => {
    expect(() =>
      HoLeeEngine.priceZeroCouponBond({ shortRate: 0.04, rateVolatility: -0.01 }, 1)
    ).toThrow();
    expect(() =>
      HoLeeEngine.priceZeroCouponBond(baseParams, 0)
    ).toThrow();
  });

  it('calculates zero-coupon bond prices with expected discount properties', () => {
    const res1 = HoLeeEngine.priceZeroCouponBond(baseParams, 1.0, 0.01);
    const res5 = HoLeeEngine.priceZeroCouponBond(baseParams, 5.0, 0.01);

    expect(res1.zeroBondPrice).toBeLessThan(1.0);
    expect(res5.zeroBondPrice).toBeLessThan(res1.zeroBondPrice);
    expect(res1.zeroYield).toBeGreaterThan(0.04);
    expect(res1.instantaneousForwardRate).toBeGreaterThan(0.04);
  });

  it('prices European call and put options on zero-coupon bonds satisfying parity', () => {
    const optParamsCall: HoLeeOptionParams = {
      bondMaturity: 5.0,
      optionExpiry: 1.0,
      strikePrice: 0.8,
      shortRate: 0.04,
      rateVolatility: 0.015,
      isCall: true,
    };

    const callRes = HoLeeEngine.priceBondOption(optParamsCall, 0.01);
    const putRes = HoLeeEngine.priceBondOption({ ...optParamsCall, isCall: false }, 0.01);

    expect(callRes.optionPrice).toBeGreaterThan(0);
    expect(putRes.optionPrice).toBeGreaterThan(0);

    // Bond option parity: Call - Put = P(0, T) - K * P(0, t)
    const expectedDiff = callRes.bondPriceT - optParamsCall.strikePrice * callRes.bondPricet;
    expect(callRes.optionPrice - putRes.optionPrice).toBeCloseTo(expectedDiff, 5);
  });
});
