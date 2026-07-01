/**
 * Tests for indicators-volatility.ts (Phase 02 coverage gate).
 *
 * Note: computeVolatilityIndicators does NOT gracefully handle empty input
 * (crashes on candles[0].high) — those guards are production bugs to be fixed
 * separately; tests here assert documented behavior on valid inputs.
 */
import { describe, it, expect } from 'vitest';
import { computeVolatilityIndicators, type VolatilityIndicators } from '../indicators-volatility';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flatCandles(n: number, base = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    open: base, high: base + 0.1, low: base - 0.1, close: base, volume: 1,
    timestamp: i * 60_000,
  }));
}

function uptrendCandles(n: number, start = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * 0.5;
    return { open: c - 0.3, high: c + 0.4, low: c - 0.4, close: c, volume: 1, timestamp: i * 60_000 };
  });
}

function downtrendCandles(n: number, start = 200): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start - i * 0.6;
    return { open: c + 0.3, high: c + 0.4, low: c - 0.4, close: c, volume: 1, timestamp: i * 60_000 };
  });
}

function volatileChoppy(n: number, center = 100, amp = 8): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = center + Math.sin(i / 4) * amp;
    return { open: c - 0.5, high: c + 1.2, low: c - 1.2, close: c, volume: 1, timestamp: i * 60_000 };
  });
}

describe('computeVolatilityIndicators', () => {
  it('returns VolatilityIndicators shape on valid input', () => {
    const r = computeVolatilityIndicators('1d', uptrendCandles(40));
    expect(Object.hasOwn(r, 'atr')).toBe(true);
    expect(Object.hasOwn(r, 'atrPct')).toBe(true);
    expect(Object.hasOwn(r, 'bollingerUpper')).toBe(true);
    expect(Object.hasOwn(r, 'bollingerMid')).toBe(true);
    expect(Object.hasOwn(r, 'bollingerLower')).toBe(true);
    expect(Object.hasOwn(r, 'bollingerWidthPct')).toBe(true);
  });

  it('ATR is positive on sufficient candles', () => {
    const r = computeVolatilityIndicators('1d', uptrendCandles(40));
    expect(r.atr).not.toBeNaN();
    expect(r.atr).toBeGreaterThan(0);
  });

  it('ATR% is positive', () => {
    const r = computeVolatilityIndicators('1d', uptrendCandles(40));
    expect(r.atrPct).not.toBeNaN();
    expect(r.atrPct).toBeGreaterThan(0);
  });

  it('Bollinger bands ordered: upper ≥ mid ≥ lower on uptrend', () => {
    const r = computeVolatilityIndicators('1d', uptrendCandles(40));
    expect(r.bollingerUpper).not.toBeNaN();
    expect(r.bollingerMid).not.toBeNaN();
    expect(r.bollingerLower).not.toBeNaN();
    expect(r.bollingerUpper).toBeGreaterThanOrEqual(r.bollingerMid);
    expect(r.bollingerMid).toBeGreaterThanOrEqual(r.bollingerLower);
  });

  it('band width is positive on sufficient candles', () => {
    const r = computeVolatilityIndicators('1d', uptrendCandles(40));
    expect(r.bollingerWidthPct).not.toBeNaN();
    expect(r.bollingerWidthPct).toBeGreaterThan(0);
  });

  it('wider bands on volatile market vs flat', () => {
    const rFlat = computeVolatilityIndicators('1d', flatCandles(40));
    const rChoppy = computeVolatilityIndicators('1d', volatileChoppy(40));
    expect(rChoppy.bollingerWidthPct).toBeGreaterThan(rFlat.bollingerWidthPct);
  });

  it('bands collapse (width=0) when fewer than 20 candles', () => {
    // computeBollinger falls back: all = last close, width = 0
    const r = computeVolatilityIndicators('1d', uptrendCandles(15));
    expect(r.bollingerUpper).not.toBeNaN();
    expect(r.bollingerWidthPct).toBe(0);
  });

  it('bollingerWidthPct scales with amplitude', () => {
    const rLow = computeVolatilityIndicators('1d', flatCandles(40));
    const rHigh = computeVolatilityIndicators('1d', volatileChoppy(40));
    expect(rHigh.bollingerWidthPct).toBeGreaterThan(rLow.bollingerWidthPct);
  });

  it('returns deterministic values on flat 200-candle series', () => {
    const r = computeVolatilityIndicators('1d', flatCandles(200));
    // flat candles → mid≈100, std≈0 → upper=mid=lower≈100
    expect(r.bollingerMid).toBeCloseTo(100, 0);
    expect(r.bollingerUpper).toBeCloseTo(100, 0);
    expect(r.bollingerLower).toBeCloseTo(100, 0);
  });
});
