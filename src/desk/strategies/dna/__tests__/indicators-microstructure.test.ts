/**
 * Tests for indicators-microstructure.ts.
 *
 * Covers:
 *  - isMicroTf: allow-list check
 *  - computeOBI: basic ratio, symmetry, zero-total edge case, out-of-range behavior
 *  - computeVWAP: basic calculation, zero-volume fallback to last close, empty candles
 *  - computeDeltaCandle: positive buying pressure, negative selling, zero volume
 *  - computeMicroIndicators: full pipeline, TF gating, empty candle gating,
 *    last-candle selection for delta, defaults for bidVol/askVol
 */

import { describe, it, expect } from 'vitest';
import {
  isMicroTf,
  computeOBI,
  computeVWAP,
  computeDeltaCandle,
  computeMicroIndicators,
} from '../indicators-microstructure';
import type { Candle } from '../multi-tf-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function c(overrides: Partial<Candle> = {}): Candle {
  return {
    time: 0,
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 10,
    ...overrides,
  };
}

// ─── isMicroTf tests ─────────────────────────────────────────────────────────

describe('isMicroTf', () => {
  it('returns true for 1m and 5m', () => {
    expect(isMicroTf('1m')).toBe(true);
    expect(isMicroTf('5m')).toBe(true);
  });

  it('returns false for higher TFs', () => {
    expect(isMicroTf('15m')).toBe(false);
    expect(isMicroTf('1h')).toBe(false);
    expect(isMicroTf('4h')).toBe(false);
    expect(isMicroTf('1d')).toBe(false);
  });
});

// ─── computeOBI tests ────────────────────────────────────────────────────────

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

// ─── computeVWAP tests ───────────────────────────────────────────────────────

describe('computeVWAP', () => {
  it('returns null on empty candles', () => {
    expect(computeVWAP([])).toBeNull();
  });

  it('computes VWAP for a single candle', () => {
    // typicalPrice = (100 + 90 + 95) / 3 = 95; vol=10; VWAP = 95*10/10 = 95
    expect(computeVWAP([c({ high: 100, low: 90, close: 95, volume: 10 })])).toBeCloseTo(
      95,
      10,
    );
  });

  it('computes VWAP across multiple candles', () => {
    // C1: tp=95, v=10 => cumVolPrice=950, cumVol=10
    // C2: tp=105, v=5  => cumVolPrice=950+525=1475, cumVol=15 => 1475/15 = 98.333...
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

// ─── computeDeltaCandle tests ────────────────────────────────────────────────

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

// ─── computeMicroIndicators tests ────────────────────────────────────────────

describe('computeMicroIndicators', () => {
  const defaultCandles = [
    c({ high: 100, low: 90, close: 95, volume: 10 }),
    c({ high: 110, low: 100, close: 105, volume: 5 }),
  ];

  it('returns null fields when TF is not micro', () => {
    const result = computeMicroIndicators('1h', defaultCandles, 50, 30);
    expect(result.obi).toBeNull();
    expect(result.vwap).toBeNull();
    expect(result.deltaCandle).toBeNull();
  });

  it('returns null fields when candles are empty on micro TF', () => {
    const result = computeMicroIndicators('1m', [], 50, 30);
    expect(result).toEqual({ obi: null, vwap: null, deltaCandle: null });
  });

  it('returns populated fields on 1m TF with data', () => {
    const result = computeMicroIndicators('1m', defaultCandles, 70, 30);
    expect(result.obi).toBeCloseTo(computeOBI(70, 30), 10);
    expect(result.vwap).toBeCloseTo(computeVWAP(defaultCandles)!, 10);
    expect(result.deltaCandle).toBeCloseTo(computeDeltaCandle(defaultCandles.at(-1)!), 10);
  });

  it('returns populated fields on 5m TF with data', () => {
    const result = computeMicroIndicators('5m', defaultCandles, 40, 60);
    expect(result.obi).toBeCloseTo(computeOBI(40, 60), 10);
    expect(result.vwap).toBeCloseTo(computeVWAP(defaultCandles)!, 10);
    expect(result.deltaCandle).toBeCloseTo(computeDeltaCandle(defaultCandles.at(-1)!), 10);
  });

  it('obi comes from bidVol/askVol args (not from candle data)', () => {
    const result = computeMicroIndicators('1m', defaultCandles, 999, 1);
    expect(result.obi).toBeCloseTo(computeOBI(999, 1), 10);
  });

  it('vwap is computed across all candles in order', () => {
    // Two candles with different volumes — VWAP should weight by volume
    const candles = [
      c({ high: 110, low: 90, close: 100, volume: 1 }),
      c({ high: 110, low: 90, close: 100, volume: 100 }),
    ];
    // Both have tp=100; VWAP=(100*1 + 100*100)/(1+100) = 10100/101 = 100
    expect(computeMicroIndicators('1m', candles, 0, 0).vwap).toBeCloseTo(100, 6);
  });

  it('deltaCandle uses only the last candle', () => {
    const candles = [
      c({ open: 100, close: 80, volume: 1 }), // first: big red
      c({ open: 80, close: 120, volume: 1 }), // second: big green
    ];
    const result = computeMicroIndicators('1m', candles, 0, 0);
    expect(result.deltaCandle).toBeCloseTo(computeDeltaCandle(candles[1]), 10);
  });

  it('defaults bidVol and askVol to 0 when omitted', () => {
    const result = computeMicroIndicators('1m', defaultCandles);
    expect(result.obi).toBeCloseTo(computeOBI(0, 0), 10); // 0
  });
});
