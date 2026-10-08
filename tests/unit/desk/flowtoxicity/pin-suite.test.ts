import { describe, expect, it } from 'vitest';
import { PinEstimator } from '../../../../src/desk/flowtoxicity/pin-estimator';
import { PinLikelihood } from '../../../../src/desk/flowtoxicity/pin-likelihood';
import {
  PinDailyTradeData,
  PinParameters,
} from '../../../../src/desk/flowtoxicity/pin-types';

describe('Order Flow Toxicity & Probability of Informed Trading (EKOP 1996 / PIN Model) Suite (Desk 97)', () => {
  const sampleParams: PinParameters = {
    alpha: 0.3,
    delta: 0.4,
    mu: 50.0,
    epsilonBuy: 30.0,
    epsilonSell: 30.0,
  };

  it('should calculate PIN ratio according to closed-form formula', () => {
    // PIN = (0.3 * 50) / (0.3 * 50 + 30 + 30) = 15 / (15 + 60) = 15 / 75 = 0.20
    const pin = PinEstimator.calculatePin(sampleParams);
    expect(pin).toBeCloseTo(0.2, 4);
  });

  it('should compute daily log-likelihood without numerical overflow or NaN', () => {
    const trade1: PinDailyTradeData = { buys: 40, sells: 35 };
    const trade2: PinDailyTradeData = { buys: 85, sells: 32 }; // Likely informed buy day

    const logLik1 = PinLikelihood.calculateDailyLogLikelihood(trade1, sampleParams);
    const logLik2 = PinLikelihood.calculateDailyLogLikelihood(trade2, sampleParams);

    expect(Number.isFinite(logLik1)).toBe(true);
    expect(Number.isFinite(logLik2)).toBe(true);
    expect(logLik1).toBeLessThan(0);
    expect(logLik2).toBeLessThan(0);
  });

  it('should assign higher posterior probability to good news on large buy imbalance days', () => {
    const heavyBuyDay: PinDailyTradeData = { buys: 90, sells: 28 };
    const regimes = PinLikelihood.calculatePosteriorRegimes(heavyBuyDay, sampleParams);

    expect(regimes.probGoodNews).toBeGreaterThan(regimes.probBadNews);
    expect(regimes.probGoodNews).toBeGreaterThan(regimes.probNoEvent);
    expect(
      regimes.probNoEvent + regimes.probBadNews + regimes.probGoodNews
    ).toBeCloseTo(1.0, 5);
  });

  it('should estimate PIN parameters using EM algorithm on simulated daily trades', () => {
    const syntheticData: PinDailyTradeData[] = [
      { buys: 32, sells: 29 }, // no event
      { buys: 28, sells: 31 }, // no event
      { buys: 84, sells: 27 }, // good news event
      { buys: 30, sells: 79 }, // bad news event
      { buys: 33, sells: 35 }, // no event
      { buys: 88, sells: 31 }, // good news event
    ];

    const result = PinEstimator.estimateViaEM(syntheticData, 50);

    expect(result.pin).toBeGreaterThan(0.0);
    expect(result.pin).toBeLessThan(1.0);
    expect(result.parameters.alpha).toBeGreaterThan(0.0);
    expect(result.parameters.mu).toBeGreaterThan(0.0);
    expect(Number.isFinite(result.logLikelihood)).toBe(true);
  });

  it('should throw when empty trade dataset is passed to estimator', () => {
    expect(() => PinEstimator.estimateViaEM([])).toThrow(
      'Trade data array cannot be empty'
    );
  });
});
