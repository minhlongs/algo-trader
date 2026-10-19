import { describe, it, expect } from 'vitest';
import { HestonNandiEngine } from '../../../../src/desk/hestonnandi/heston-nandi-engine';
import { HestonNandiParams } from '../../../../src/desk/hestonnandi/heston-nandi-types';

describe('Desk 129: Heston-Nandi (2000) GARCH Option Pricing Engine', () => {
  // Realistic annualized daily params: omega=1e-6, alpha=1.5e-6, beta=0.7, gamma=100
  // persistence = 0.7 + 1.5e-6 * 10000 = 0.715 < 1.0
  const baseParams: HestonNandiParams = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToMaturityDays: 30,
    dailyRiskFreeRate: 0.05 / 252,
    omega: 1e-6,
    alpha: 1.5e-6,
    beta: 0.7,
    gamma: 100.0,
  };

  it('prices ATM call and put options with valid bounds and Put-Call parity consistency', () => {
    const res = HestonNandiEngine.evaluate(baseParams);

    expect(res.callPrice).toBeGreaterThan(0.0);
    expect(res.putPrice).toBeGreaterThan(0.0);
    expect(res.callPrice).toBeLessThan(res.spotPrice);
    expect(res.stationaryVariance).toBeGreaterThan(0.0);
    // Put-Call parity: C - P = S - K * exp(-r * T)
    expect(res.putCallParityError).toBeLessThan(1e-4);
  });

  it('exhibits strict moneyness monotonicity across strikes', () => {
    const itmCall = HestonNandiEngine.evaluate({ ...baseParams, strikePrice: 90.0 }).callPrice;
    const atmCall = HestonNandiEngine.evaluate({ ...baseParams, strikePrice: 100.0 }).callPrice;
    const otmCall = HestonNandiEngine.evaluate({ ...baseParams, strikePrice: 110.0 }).callPrice;

    expect(itmCall).toBeGreaterThan(atmCall);
    expect(atmCall).toBeGreaterThan(otmCall);

    const itmPut = HestonNandiEngine.evaluate({ ...baseParams, strikePrice: 90.0 }).putPrice;
    const atmPut = HestonNandiEngine.evaluate({ ...baseParams, strikePrice: 100.0 }).putPrice;
    const otmPut = HestonNandiEngine.evaluate({ ...baseParams, strikePrice: 110.0 }).putPrice;

    expect(itmPut).toBeLessThan(atmPut);
    expect(atmPut).toBeLessThan(otmPut);
  });

  it('reflects positive time value with maturity expansion', () => {
    const shortMaturity = HestonNandiEngine.evaluate({
      ...baseParams,
      timeToMaturityDays: 15,
    }).callPrice;
    const longMaturity = HestonNandiEngine.evaluate({
      ...baseParams,
      timeToMaturityDays: 60,
    }).callPrice;

    expect(longMaturity).toBeGreaterThan(shortMaturity);
  });

  it('validates input parameters and rejects invalid states', () => {
    expect(() =>
      HestonNandiEngine.evaluate({ ...baseParams, spotPrice: -5 })
    ).toThrow(/Spot price must be positive/);

    expect(() =>
      HestonNandiEngine.evaluate({ ...baseParams, timeToMaturityDays: 0 })
    ).toThrow(/Time to maturity days must be a positive integer/);

    expect(() =>
      HestonNandiEngine.evaluate({ ...baseParams, beta: 0.95, alpha: 1e-4, gamma: 100 })
    ).toThrow(/GARCH persistence beta \+ alpha\*gamma\^2 must be < 1/);
  });
});
