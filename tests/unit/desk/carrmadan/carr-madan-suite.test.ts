import { describe, it, expect } from 'vitest';
import { CarrMadanEngine } from '../../../../src/desk/carrmadan/carr-madan-engine';
import { CarrMadanParams } from '../../../../src/desk/carrmadan/carr-madan-types';

describe('Desk 126: Carr-Madan (1998) FFT Option Pricing Engine', () => {
  const baseParams: CarrMadanParams = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToMaturity: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    volatility: 0.20,
    alpha: 1.5,
  };

  it('accurately prices ATM call option consistent with analytical Black-Scholes benchmark', () => {
    const res = CarrMadanEngine.price(baseParams);

    // Standard Black-Scholes call with S=100, K=100, T=1, r=0.05, q=0.02, sig=0.2 is approx 9.227
    expect(res.callPrice).toBeGreaterThan(9.0);
    expect(res.callPrice).toBeLessThan(9.5);
  });

  it('satisfies Put-Call parity condition within numerical quadrature tolerance', () => {
    const res = CarrMadanEngine.price(baseParams);

    expect(res.putCallParityError).toBeLessThan(1e-4);
    expect(res.putPrice).toBeGreaterThan(0.0);
  });

  it('obeys lower bound monotonicity for in-the-money and out-of-the-money options', () => {
    const itm = CarrMadanEngine.price({ ...baseParams, strikePrice: 80.0 });
    const otm = CarrMadanEngine.price({ ...baseParams, strikePrice: 120.0 });

    expect(itm.callPrice).toBeGreaterThan(baseParams.spotPrice - 80.0);
    expect(itm.callPrice).toBeGreaterThan(otm.callPrice);
    expect(otm.callPrice).toBeGreaterThan(0.0);
  });

  it('handles variations in dampening factor alpha stably', () => {
    const resAlpha1 = CarrMadanEngine.price({ ...baseParams, alpha: 1.2 });
    const resAlpha2 = CarrMadanEngine.price({ ...baseParams, alpha: 2.0 });

    expect(resAlpha1.callPrice).toBeCloseTo(resAlpha2.callPrice, 2);
  });

  it('throws validation error on invalid input parameters', () => {
    expect(() =>
      CarrMadanEngine.price({ ...baseParams, spotPrice: -10 })
    ).toThrow(/Spot price must be positive/);

    expect(() =>
      CarrMadanEngine.price({ ...baseParams, volatility: 0 })
    ).toThrow(/Volatility must be positive/);

    expect(() =>
      CarrMadanEngine.price({ ...baseParams, alpha: -0.5 })
    ).toThrow(/Alpha dampening parameter must be positive/);
  });
});
