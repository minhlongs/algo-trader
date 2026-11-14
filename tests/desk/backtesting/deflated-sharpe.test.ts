/**
 * Deflated Sharpe Ratio tests.
 */
import { describe, it, expect } from 'vitest';
import {
  deflatedSharpeRatio,
  probabilisticSharpeRatio,
} from '../../../src/desk/backtesting/deflated-sharpe';
import {
  erf,
  expectedMaxSharpe,
  inverseNormalCdf,
  normalCdf,
} from '../../../src/desk/backtesting/deflated-sharpe-math';

describe('deflated-sharpe-math', () => {
  it('erf matches known values', () => {
    expect(erf(0)).toBe(0);
    expect(erf(1)).toBeCloseTo(0.8427007929, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427007929, 6);
  });

  it('normalCdf matches known values and is symmetric', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 10);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021049, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(1 - normalCdf(1.96), 10);
  });

  it('inverseNormalCdf inverts normalCdf', () => {
    for (const p of [0.001, 0.05, 0.5, 0.95, 0.999]) {
      expect(normalCdf(inverseNormalCdf(p))).toBeCloseTo(p, 8);
    }
  });

  it('expectedMaxSharpe is 0 for a single trial and grows with trial count', () => {
    expect(expectedMaxSharpe(1, 0.05)).toBe(0);
    const two = expectedMaxSharpe(2, 0.05);
    const hundred = expectedMaxSharpe(100, 0.05);
    expect(two).toBeGreaterThan(0);
    expect(hundred).toBeGreaterThan(two);
  });
});

describe('probabilisticSharpeRatio', () => {
  it('returns 0.5 for a zero Sharpe against a zero benchmark', () => {
    expect(probabilisticSharpeRatio(0, 0, 250, 0, 3)).toBeCloseTo(0.5, 9);
  });

  it('rises above 0.5 for a positive Sharpe and falls below for a negative one', () => {
    expect(probabilisticSharpeRatio(0.1, 0, 250, 0, 3)).toBeGreaterThan(0.9);
    expect(probabilisticSharpeRatio(-0.1, 0, 250, 0, 3)).toBeLessThan(0.1);
  });
});

describe('deflatedSharpeRatio', () => {
  it('strictly lowers the probability as nTrials increases', () => {
    const base = { observedSharpe: 0.15, sampleLength: 500, skewness: 0, kurtosis: 3 };
    const probabilities = [1, 2, 5, 20, 100, 1000].map(
      (nTrials) => deflatedSharpeRatio({ ...base, nTrials }).probability,
    );
    for (let i = 1; i < probabilities.length; i++) {
      expect(probabilities[i]).toBeLessThan(probabilities[i - 1]);
    }
  });

  it('returns ~0.5 or below for an observed Sharpe of 0', () => {
    for (const nTrials of [1, 10, 100]) {
      const { probability } = deflatedSharpeRatio({
        observedSharpe: 0,
        nTrials,
        sampleLength: 500,
      });
      expect(probability).toBeLessThanOrEqual(0.500001);
      expect(probability).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns a high probability for a very large Sharpe with a single trial', () => {
    const { probability, expectedMaxSharpeUnderNull } = deflatedSharpeRatio({
      observedSharpe: 1.5,
      nTrials: 1,
      sampleLength: 500,
    });
    expect(expectedMaxSharpeUnderNull).toBe(0);
    expect(probability).toBeGreaterThan(0.99);
  });

  it('deflates an annualized Sharpe before testing it', () => {
    // Per-observation equivalent of the same annualized Sharpe must agree.
    const annualized = deflatedSharpeRatio({
      observedSharpe: 1.2,
      nTrials: 5,
      sampleLength: 500,
      periodsPerYear: 252,
    });
    const perPeriod = deflatedSharpeRatio({
      observedSharpe: 1.2 / Math.sqrt(252),
      nTrials: 5,
      sampleLength: 500,
    });
    expect(annualized.probability).toBeCloseTo(perPeriod.probability, 10);
    expect(annualized.observedSharpePerPeriod).toBeCloseTo(perPeriod.observedSharpePerPeriod, 10);
  });

  it('penalises fat tails (higher kurtosis) relative to the normal case', () => {
    const normal = deflatedSharpeRatio({
      observedSharpe: 0.12,
      nTrials: 10,
      sampleLength: 400,
      kurtosis: 3,
    });
    const fatTails = deflatedSharpeRatio({
      observedSharpe: 0.12,
      nTrials: 10,
      sampleLength: 400,
      kurtosis: 12,
    });
    expect(fatTails.probability).toBeLessThan(normal.probability);
  });

  it('validates inputs', () => {
    expect(() => deflatedSharpeRatio({ observedSharpe: 0.1, nTrials: 0, sampleLength: 100 })).toThrow(RangeError);
    expect(() => deflatedSharpeRatio({ observedSharpe: 0.1, nTrials: 1.5, sampleLength: 100 })).toThrow(RangeError);
    expect(() => deflatedSharpeRatio({ observedSharpe: 0.1, nTrials: 1, sampleLength: 1 })).toThrow(RangeError);
    expect(() => deflatedSharpeRatio({ observedSharpe: Number.NaN, nTrials: 1, sampleLength: 100 })).toThrow(RangeError);
    expect(() =>
      deflatedSharpeRatio({ observedSharpe: 0.1, nTrials: 1, sampleLength: 100, periodsPerYear: 0 }),
    ).toThrow(RangeError);
  });
});
