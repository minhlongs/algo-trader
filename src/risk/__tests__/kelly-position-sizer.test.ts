/**
 * Tests for Kelly Criterion Position Sizer
 * Covers calculateKelly function and KellyPositionSizer class
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateKelly, KellyPositionSizer, type KellyInput, type CalculatePositionSizeInput } from '../kelly-position-sizer';

describe('calculateKelly', () => {
  it('returns zero when avgLoss is zero or negative', () => {
    const input: KellyInput = { winRate: 0.6, avgWin: 100, avgLoss: 0, bankroll: 1000 };
    const result = calculateKelly(input);
    expect(result.kellyFraction).toBe(0);
    expect(result.recommendedSize).toBe(0);
    expect(result.cappedFraction).toBe(0);
  });

  it('returns zero when bankroll is zero or negative', () => {
    const input: KellyInput = { winRate: 0.6, avgWin: 100, avgLoss: 50, bankroll: 0 };
    const result = calculateKelly(input);
    expect(result.kellyFraction).toBe(0);
    expect(result.recommendedSize).toBe(0);
    expect(result.cappedFraction).toBe(0);
  });

  it('calculates correct kelly fraction for standard inputs', () => {
    const input: KellyInput = { winRate: 0.6, avgWin: 100, avgLoss: 50, bankroll: 1000, maxFraction: 0.25 };
    const result = calculateKelly(input);
    expect(result.kellyFraction).toBeCloseTo(0.4);
    expect(result.cappedFraction).toBe(0.25);
    expect(result.recommendedSize).toBe(250);
  });

  it('does not cap when kellyFraction is below maxFraction', () => {
    const input: KellyInput = { winRate: 0.55, avgWin: 100, avgLoss: 100, bankroll: 1000, maxFraction: 0.25 };
    const result = calculateKelly(input);
    expect(result.kellyFraction).toBeCloseTo(0.1);
    expect(result.cappedFraction).toBeCloseTo(0.1);
    expect(result.recommendedSize).toBeCloseTo(100);
  });

  it('returns zero cappedFraction when kellyFraction is negative (no edge)', () => {
    const input: KellyInput = { winRate: 0.4, avgWin: 100, avgLoss: 100, bankroll: 1000, maxFraction: 0.25 };
    const result = calculateKelly(input);
    expect(result.kellyFraction).toBeCloseTo(-0.2);
    expect(result.cappedFraction).toBe(0);
    expect(result.recommendedSize).toBe(0);
  });

  it('uses default maxFraction of 0.25 when not provided', () => {
    const input: KellyInput = { winRate: 0.6, avgWin: 100, avgLoss: 50, bankroll: 1000 };
    const result = calculateKelly(input);
    expect(result.cappedFraction).toBe(0.25);
  });

  it('handles fractional win rates correctly', () => {
    const input: KellyInput = { winRate: 0.51, avgWin: 100, avgLoss: 99, bankroll: 5000, maxFraction: 0.2 };
    const result = calculateKelly(input);
    const b = 100 / 99;
    const expected = (b * 0.51 - 0.49) / b;
    expect(result.kellyFraction).toBeCloseTo(expected);
  });
});

describe('KellyPositionSizer', () => {
  let sizer: KellyPositionSizer;

  beforeEach(() => {
    sizer = new KellyPositionSizer({ kellyFraction: 0.25, maxPositionFraction: 0.05, minPositionUsd: 10 });
  });

  it('returns zero when winProbability is zero', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0, winLossRatio: 2, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(0);
    expect(result.kellyFraction).toBe(0);
  });

  it('returns zero when winProbability is 1', () => {
    const input: CalculatePositionSizeInput = { winProbability: 1, winLossRatio: 2, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(0);
  });

  it('returns zero when winLossRatio is zero or negative', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 0, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(0);
  });

  it('returns zero when portfolioValue is zero or negative', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 2, portfolioValue: 0, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(0);
  });

  it('calculates position size with no correlation', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 2, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    // kellyFraction = (2*0.6-0.4)/2 = 0.4, capped at 0.25
    // recommendedSize = 10000 * 0.25 = 2500
    // correlationFactor = 1 - 0 = 1
    // adjustedSize = 2500
    // cap = 10000 * 0.05 = 500
    // cappedByMax = true
    // positionSizeUsd = max(10, 500) = 500
    expect(result.kellyFraction).toBeCloseTo(0.4);
    expect(result.cappedFraction).toBe(0.25);
    expect(result.correlationAdjustedSize).toBe(2500);
    expect(result.cappedByMax).toBe(true);
    expect(result.positionSizeUsd).toBe(500);
    expect(result.kellyAdjusted).toBeCloseTo(0.1); // 0.4 * 0.25
  });

  it('applies correlation adjustment', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 2, portfolioValue: 10000, correlation: 0.3 };
    const result = sizer.calculatePositionSize(input);
    expect(result.correlationAdjustedSize).toBeCloseTo(1750); // 2500 * 0.7
    expect(result.cappedByMax).toBe(true);
    expect(result.positionSizeUsd).toBe(500); // still capped at maxPositionFraction
  });

  it('does not exceed maxPositionFraction', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.8, winLossRatio: 10, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(500); // max 5% of 10000
    expect(result.cappedByMax).toBe(true);
  });

  it('respects minPositionUsd floor', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.51, winLossRatio: 1.01, portfolioValue: 100, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(10); // minPositionUsd
  });

  it('returns portfolioPercent as percentage', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 2, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.portfolioPercent).toBeCloseTo(5); // 500 / 10000 * 100
  });

  it('getConfig returns current config', () => {
    const config = sizer.getConfig();
    expect(config.kellyFraction).toBe(0.25);
    expect(config.maxPositionFraction).toBe(0.05);
    expect(config.minPositionUsd).toBe(10);
  });

  it('clamps kellyFraction to 0.1-0.5 range', () => {
    const sizerLow = new KellyPositionSizer({ kellyFraction: 0.01, maxPositionFraction: 0.05, minPositionUsd: 1 });
    const sizerHigh = new KellyPositionSizer({ kellyFraction: 0.9, maxPositionFraction: 0.05, minPositionUsd: 1 });
    expect(sizerLow.getConfig().kellyFraction).toBe(0.1);
    expect(sizerHigh.getConfig().kellyFraction).toBe(0.5);
  });

  it('applies managed capital cap at 0.25', () => {
    const sizerManaged = new KellyPositionSizer({ kellyFraction: 0.5, maxPositionFraction: 0.05, minPositionUsd: 1, isManagedCapital: true });
    expect(sizerManaged.getConfig().kellyFraction).toBe(0.25);
  });

  it('reads KELLY_FRACTION from env when not explicitly provided', () => {
    vi.stubEnv('KELLY_FRACTION', '0.3');
    const sizerEnv = new KellyPositionSizer({ maxPositionFraction: 0.05, minPositionUsd: 1 });
    expect(sizerEnv.getConfig().kellyFraction).toBe(0.3);
    vi.unstubAllEnvs();
  });

  it('handles small portfolio values correctly', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.55, winLossRatio: 2, portfolioValue: 50, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.positionSizeUsd).toBe(10);
  });

  it('computes fractionUsed correctly', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 2, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.fractionUsed).toBe(0.25);
  });

  it('computes kellyAdjusted correctly', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.6, winLossRatio: 2, portfolioValue: 10000, correlation: 0 };
    const result = sizer.calculatePositionSize(input);
    expect(result.kellyAdjusted).toBeCloseTo(0.1);
  });

  it('handles high correlation reducing size below cap', () => {
    const input: CalculatePositionSizeInput = { winProbability: 0.7, winLossRatio: 3, portfolioValue: 10000, correlation: 0.8 };
    const result = sizer.calculatePositionSize(input);
    expect(result.correlationAdjustedSize).toBeCloseTo(500);
    expect(result.positionSizeUsd).toBeCloseTo(500);
    expect(result.cappedByMax).toBe(false);
  });
});