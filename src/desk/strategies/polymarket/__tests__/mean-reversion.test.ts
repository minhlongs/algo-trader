import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, computeZScore, getMrDirection } from '../mean-reversion';

describe('mean-reversion::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.spikeThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.exitThreshold).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maWindow).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.sizeUsdc).toBeGreaterThan(0);
  });
});

describe('mean-reversion::computeZScore', () => {
  it('returns 0 for empty or single-element arrays', () => {
    expect(computeZScore(0.5, [])).toBe(0);
    expect(computeZScore(0.5, [0.5])).toBe(0);
  });
  it('returns 0 when all prices equal', () => {
    expect(computeZScore(0.5, [0.5, 0.5, 0.5])).toBe(0);
  });
  it('returns negative for price below mean', () => {
    const r = computeZScore(0.3, [0.8, 0.7, 0.6, 0.5, 0.4]);
    expect(r).toBeLessThan(0);
  });
  it('returns positive for price above mean', () => {
    const r = computeZScore(0.9, [0.3, 0.4, 0.5, 0.6, 0.7]);
    expect(r).toBeGreaterThan(0);
  });
  it('returns 0 for price at mean', () => {
    const prices = [0.3, 0.5, 0.7];
    expect(computeZScore(0.5, prices)).toBeCloseTo(0, 1);
  });
  it('returns finite number for valid input', () => {
    const r = computeZScore(0.6, [0.5, 0.5, 0.5, 0.8]);
    expect(Number.isFinite(r)).toBe(true);
  });
});

describe('mean-reversion::getMrDirection', () => {
  it('returns yes for extreme negative z-score (below mean)', () => {
    expect(getMrDirection(-3)).toBe('yes');
  });
  it('returns no for extreme positive z-score (above mean)', () => {
    expect(getMrDirection(3)).toBe('no');
  });
  it('returns null for threshold-zero with positive z-score not extreme', () => {
    // At threshold=0, any non-zero z-score qualifies, but check boundary
    expect(getMrDirection(0)).toBeNull();
  });
  it('returns null for threshold-zero with negative z-score not extreme', () => {
    expect(getMrDirection(-0.1)).toBeNull();
  });
});
