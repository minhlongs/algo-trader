
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, computeEntropy, computeBias, getDirection, createEntropyScorerTick } from '../entropy-scorer';

describe('entropy-scorer::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.entropyThreshold).toBeCloseTo(0.7, 5);
    expect(DEFAULT_CONFIG.minBias).toBeCloseTo(0.15, 5);
    expect(DEFAULT_CONFIG.lookback).toBe(5);
  });
});

describe('entropy-scorer::computeEntropy', () => {
  it('returns near-0 for clamped p=0 and p=1', () => {
    const r0 = computeEntropy(0);
    const r1 = computeEntropy(1);
    expect(r0).toBeGreaterThan(0);
    expect(r0).toBeLessThan(0.1);
    expect(r1).toBeGreaterThan(0);
    expect(r1).toBeLessThan(0.1);
  });
  it('returns 1 for p=0.5 (max uncertainty)', () => {
    expect(computeEntropy(0.5)).toBeCloseTo(1, 5);
  });
  it('returns value between 0 and 1', () => {
    const r = computeEntropy(0.7);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });
  it('clamps extreme inputs to valid range', () => {
    const r = computeEntropy(-1);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.1);
  });
});

describe('entropy-scorer::computeBias', () => {
  it('returns 0 at p=0.5', () => {
    expect(computeBias(0.5)).toBe(0);
  });
  it('returns 1 at p=0 or p=1', () => {
    expect(computeBias(0)).toBe(1);
    expect(computeBias(1)).toBe(1);
  });
  it('returns 0.6 at p=0.8', () => {
    expect(computeBias(0.8)).toBeCloseTo(0.6, 5);
  });
});

describe('entropy-scorer::getDirection', () => {
  it('returns yes for p > 0.5 with sufficient bias', () => {
    expect(getDirection(0.9)).toBe('yes');
  });
  it('returns no for p < 0.5 with sufficient bias', () => {
    expect(getDirection(0.1)).toBe('no');
  });
  it('returns null at exactly 0.5', () => {
    expect(getDirection(0.5)).toBeNull();
  });
  it('returns null when bias < 0.05', () => {
    // p=0.52 -> bias = 0.04 < 0.05
    expect(getDirection(0.52)).toBeNull();
  });
  it('returns null when bias < 0.05 on low side', () => {
    // p=0.48 -> bias = 0.04 < 0.05
    expect(getDirection(0.48)).toBeNull();
  });
});

describe('entropy-scorer::createEntropyScorerTick', () => {
  it('returns a tick function', () => {
    const tick = createEntropyScorerTick({
      clob: { getOrderBook: async () => ({ bids: [], asks: [] }) },
      orders: {},
      bus: { publish: async () => {} },
      gamma: { getTrending: async () => [] },
    } as any);
    expect(typeof tick).toBe('function');
  });
});
