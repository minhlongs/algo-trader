import { describe, it, expect } from 'vitest';
import { computeBasis, getArbDirection } from '../cross-market-arb';

describe('cross-market-arb::DEFAULT_CONFIG', () => {
  it('module exports computeBasis and getArbDirection', () => {
    expect(typeof computeBasis).toBe('function');
    expect(typeof getArbDirection).toBe('function');
  });

describe('cross-market-arb::computeBasis', () => {
  it('returns 0 when prices are equal', () => {
    expect(computeBasis(0.5, 0.5)).toBe(0);
  });
  it('returns absolute difference', () => {
    expect(computeBasis(0.7, 0.5)).toBeCloseTo(0.2, 5);
  });
  it('returns 0.3 for 0.5 and 0.8', () => {
    expect(computeBasis(0.5, 0.8)).toBeCloseTo(0.3, 5);
  });
  it('order of args does not matter', () => {
    expect(computeBasis(0.3, 0.8)).toBeCloseTo(computeBasis(0.8, 0.3), 5);
  });
  it('clamps to non-negative', () => {
    const r = computeBasis(0.1, 0.95);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

describe('cross-market-arb::getArbDirection', () => {
  it('buy yes/no when priceA < priceB', () => {
    const dir = getArbDirection(0.4, 0.6);
    expect(dir.sideA).toBe('yes');
    expect(dir.sideB).toBe('no');
  });
  it('buy no/yes when priceA > priceB', () => {
    const dir = getArbDirection(0.6, 0.4);
    expect(dir.sideA).toBe('no');
    expect(dir.sideB).toBe('yes');
  });
  it('flips when prices switch', () => {
    const d1 = getArbDirection(0.4, 0.6);
    const d2 = getArbDirection(0.6, 0.4);
    expect(d1.sideA).toBe('yes');
    expect(d2.sideA).toBe('no');
  });
  it('equal prices returns no/yes (priceA not < priceB)', () => {
    const dir = getArbDirection(0.5, 0.5);
    expect(dir.sideA).toBe('no');
    expect(dir.sideB).toBe('yes');
  });
});
});
