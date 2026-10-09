/**
 * Unit tests for Heston & Nandi (2000) GARCH Option Pricing Engine.
 * Strictly zero-mock, real characteristic function Fourier inversion, strictly < 150 LOC.
 */

import { describe, it, expect } from 'vitest';
import {
  HestonNandiEngine,
  HestonNandiParameters,
} from '../../../../src/desk/hestonnandi';

describe('Wave 199: Heston & Nandi (2000) GARCH Option Pricing Suite', () => {
  // Benchmark parameters from Heston-Nandi (2000) Table 1 empirical estimates
  const benchmarkParams: HestonNandiParameters = {
    omega: 1.0e-6,
    beta: 0.65,
    alpha: 1.5e-5,
    gamma: 120.0,
    lambda: 0.4,
    riskFreeRate: 0.05 / 252, // Daily rate corresponding to 5% annualized
  };

  it('computes unconditional long-run variance and confirms stationarity', () => {
    const engine = new HestonNandiEngine();
    const { variance, stationary } = engine.calculateUnconditionalVariance(benchmarkParams);

    expect(stationary).toBe(true);
    expect(variance).toBeGreaterThan(0);
    // Annualized volatility sqrt(variance * 252) should be in typical equity range (10% - 30%)
    const annualizedVol = Math.sqrt(variance * 252);
    expect(annualizedVol).toBeGreaterThan(0.08);
    expect(annualizedVol).toBeLessThan(0.35);
  });

  it('prices European call and put satisfying put-call parity', () => {
    const engine = new HestonNandiEngine();
    const spot = 100.0;
    const strike = 100.0;
    const days = 30;

    const result = engine.priceOption({
      spotPrice: spot,
      strikePrice: strike,
      daysToExpiration: days,
      parameters: benchmarkParams,
    });

    expect(result.callPrice).toBeGreaterThan(0);
    expect(result.putPrice).toBeGreaterThan(0);

    // Put-Call Parity: C - P = S - K * exp(-r * tau)
    const discount = Math.exp(-benchmarkParams.riskFreeRate * days);
    const parityDiff = result.callPrice - result.putPrice - (spot - strike * discount);
    expect(Math.abs(parityDiff)).toBeLessThan(0.05);

    // Probabilities P1 and P2 should lie in (0, 1)
    expect(result.p1Prob).toBeGreaterThan(0);
    expect(result.p1Prob).toBeLessThan(1);
    expect(result.p2Prob).toBeGreaterThan(0);
    expect(result.p2Prob).toBeLessThan(1);
  });

  it('exhibits correct moneyness sensitivity: ITM call > ATM call > OTM call', () => {
    const engine = new HestonNandiEngine();
    const spot = 100.0;
    const days = 20;

    const itm = engine.priceOption({
      spotPrice: spot,
      strikePrice: 90.0,
      daysToExpiration: days,
      parameters: benchmarkParams,
    });

    const atm = engine.priceOption({
      spotPrice: spot,
      strikePrice: 100.0,
      daysToExpiration: days,
      parameters: benchmarkParams,
    });

    const otm = engine.priceOption({
      spotPrice: spot,
      strikePrice: 110.0,
      daysToExpiration: days,
      parameters: benchmarkParams,
    });

    expect(itm.callPrice).toBeGreaterThan(atm.callPrice);
    expect(atm.callPrice).toBeGreaterThan(otm.callPrice);
    expect(itm.deltaCall).toBeGreaterThan(atm.deltaCall);
    expect(atm.deltaCall).toBeGreaterThan(otm.deltaCall);
  });

  it('computes positive delta and gamma for ATM call', () => {
    const engine = new HestonNandiEngine();
    const result = engine.priceOption({
      spotPrice: 100.0,
      strikePrice: 100.0,
      daysToExpiration: 25,
      parameters: benchmarkParams,
    });

    expect(result.deltaCall).toBeGreaterThan(0.3);
    expect(result.deltaCall).toBeLessThan(0.8);
    expect(result.gammaCall).toBeGreaterThan(0);
  });
});
