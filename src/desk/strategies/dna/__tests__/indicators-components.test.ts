/**
 * Tests for microstructure component indicators: computeOBI, computeVWAP, computeDeltaCandle.
 */

import { describe, it, expect } from 'vitest';
import {
  computeOBI,
  computeVWAP,
  computeDeltaCandle,
} from '../indicators-microstructure.js';
import { c } from './indicators-microstructure-fixtures.js';

describe('computeOBI', () => {
  it('returns 1 when only bids present', () => {
    expect(computeOBI(100, 0)).toBeCloseTo(1, 10);
  });

  it('returns -1 when only asks present', () => {
    expect(computeOBI(0, 100)).toBeCloseTo(-1, 10);
  });

  it('returns 0 on balanced book', () => {
    expect(computeOBI(50, 50)).toBe(0);
  });

  it('computes symmetric ratio', () => {
    expect(computeOBI(70, 30)).toBeCloseTo((70 - 30) / 100, 10);
  });

  it('returns 0 when both zero (total === 0 edge case)', () => {
    expect(computeOBI(0, 0)).toBe(0);
  });

  it('returns value in [-1, 1] for any positive inputs', () => {
    const val = computeOBI(25, 75);
    expect(val).toBeGreaterThanOrEqual(-1);
    expect(val).toBeLessThanOrEqual(1);
  });
});

describe('computeVWAP', () => {
  it('returns null on empty candles', () => {
    expect(computeVWAP([])).toBeNull();
  });

  it('computes VWAP for a single candle', () => {
    expect(computeVWAP([c({ high: 100, low: 90, close: 95, volume: 10 })])).toBeCloseTo(
      95,
      10,
    );
  });

  it('computes VWAP across multiple candles', () => {
    const candles = [
      c({ high: 100, low: 90, close: 95, volume: 10 }),
      c({ high: 110, low: 100, close: 105, volume: 5 }),
    ];
    expect(computeVWAP(candles)).toBeCloseTo(1475 / 15, 6);
  });

  it('falls back to last candle close when cumVol is zero', () => {
    const candles = [c({ close: 123.45, volume: 0 })];
    expect(computeVWAP(candles)).toBeCloseTo(123.45, 6);
  });

  it('falls back to last close even when many zero-volume candles precede a last zero', () => {
    const candles = [
      c({ close: 100, volume: 0 }),
      c({ close: 200, volume: 0 }),
    ];
    expect(computeVWAP(candles)).toBeCloseTo(200, 10);
  });
});

describe('computeDeltaCandle', () => {
  it('positive delta when close > open', () => {
    expect(computeDeltaCandle(c({ open: 100, close: 105 }))).toBe(5);
  });

  it('negative delta when close < open', () => {
    expect(computeDeltaCandle(c({ open: 105, close: 100 }))).toBe(-5);
  });

  it('zero delta when close === open', () => {
    expect(computeDeltaCandle(c({ open: 100, close: 100 }))).toBe(0);
  });

  it('returns 0 when volume is 0', () => {
    expect(computeDeltaCandle(c({ open: 100, close: 105, volume: 0 }))).toBe(0);
  });

  it('volume > 0 — delta is purely price-driven (volume field not in formula)', () => {
    expect(computeDeltaCandle(c({ open: 100, close: 105, volume: 999 }))).toBe(5);
  });
});
