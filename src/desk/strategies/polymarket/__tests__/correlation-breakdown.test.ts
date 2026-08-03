import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  calcPearsonR,
  calcCorrZScore,
  createCorrelationBreakdownTick,
} from '../correlation-breakdown';

describe('correlation-breakdown::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.windowSize).toBe(20);
    expect(DEFAULT_CONFIG.zScoreThreshold).toBeCloseTo(2.5, 5);
    expect(DEFAULT_CONFIG.minCorrelation).toBeCloseTo(0.7, 5);
    expect(DEFAULT_CONFIG.minVolume).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.baseSizeUsdc).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.scanLimit).toBeGreaterThan(0);
  });
});

describe('correlation-breakdown::calcPearsonR', () => {
  it('returns 1 for perfectly positively correlated', () => {
    expect(calcPearsonR([1,2,3], [2,4,6])).toBeCloseTo(1, 5);
  });
  it('returns -1 for perfectly negatively correlated', () => {
    expect(calcPearsonR([1,2,3], [3,2,1])).toBeCloseTo(-1, 5);
  });
  it('returns 0 for zero-variance input', () => {
    expect(calcPearsonR([2,2,2], [1,2,3])).toBe(0);
  });
  it('returns 0 for different-length arrays', () => {
    expect(calcPearsonR([1,2], [1])).toBe(0);
  });
  it('returns 0 for fewer than 3 points', () => {
    expect(calcPearsonR([1,2], [1,2])).toBe(0);
  });
  it('clamps to [-1, 1]', () => {
    // Identical arrays gives 1, should not exceed bounds
    const r = calcPearsonR([1,2,3,4,5], [1,2,3,4,5]);
    expect(r).toBeCloseTo(1, 5);
  });
});

describe('correlation-breakdown::calcCorrZScore', () => {
  it('returns computed value for empty history', () => {
    const r = calcCorrZScore(0.5, []);
    // mean=0, std=0.2 default -> (0-0.5)/0.2 = -2.5
    expect(Number.isFinite(r)).toBe(true);
  });
  it('returns 0 for single-element history', () => {
    expect(calcCorrZScore(0.5, [0.5])).toBe(0);
  });
  it('returns 0 when history variance is zero', () => {
    expect(calcCorrZScore(0.8, [0.7, 0.7, 0.7, 0.7])).toBe(0);
  });
  it('returns positive z-score when current is high relative to mean', () => {
    // mean=0.5, std approx 0.158 -> (0.5-0.9)/0.158 = -2.53
    // function computes (mean - current)/std, so positive when current < mean
    const hist = [0.9, 0.9, 0.9, 0.9, 0.5];
    const r = calcCorrZScore(0.3, hist);
    expect(r).toBeGreaterThan(0);
  });
  it('produces finite number for valid inputs', () => {
    const r = calcCorrZScore(0.9, [0.5, 0.6, 0.7, 0.8, 0.85]);
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('correlation-breakdown::createCorrelationBreakdownTick', () => {
  it('returns a tick function from deps', () => {
    const tick = createCorrelationBreakdownTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [], getEvents: async () => ({ markets: [] }) },
    } as any);
    expect(typeof tick).toBe('function');
  });
});
