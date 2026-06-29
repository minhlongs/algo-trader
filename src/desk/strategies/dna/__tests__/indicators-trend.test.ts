/**
 * Tests for indicators-trend.ts (Phase 02 coverage gate).
 */
import { describe, it, expect } from 'vitest';
import { computeTrendIndicators, trendDirectionScore } from '../indicators-trend';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flatCandles(n: number, base = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    open: base, high: base, low: base, close: base, volume: 1,
    timestamp: i * 60_000,
  }));
}

function uptrendCandles(n: number, start = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * 0.5;
    return { open: c - 0.2, high: c + 0.3, low: c - 0.3, close: c, volume: 1, timestamp: i * 60_000 };
  });
}

/** Strong downtrend: starts at 200 and drops in big steps to 80. */
function downtrendCandles(n: number): Candle[] {
  const stops = [200, 170, 140, 110, 80];
  const seg = Math.floor(n / (stops.length - 1));
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const segIdx = Math.min(Math.floor(i / seg), stops.length - 2);
    const c = stops[segIdx] + (stops[segIdx + 1] - stops[segIdx]) * ((i % seg) / seg);
    out.push({ open: c - 0.5, high: c + 0.5, low: c - 0.5, close: c, volume: 1, timestamp: i * 60000 });
  }
  return out;
}

function choppyCandles(n: number, center = 100, amp = 5): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = center + Math.sin(i / 5) * amp;
    return { open: c - 0.2, high: c + 0.3, low: c - 0.3, close: c, volume: 1, timestamp: i * 60_000 };
  });
}

describe('computeTrendIndicators', () => {
  it('returns numbers on valid input (not all-null fallback)', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(20));
    expect(typeof r.ema20).toBe('number');
    expect(typeof r.ema50).toBe('number');
    expect(typeof r.adx).toBe('number');
    expect(r.adxTrend).toBe('sideways');
  });

  it('ema200 is null when fewer than 200 candles', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(120));
    expect(r.ema20).not.toBeNull();
    expect(r.ema50).not.toBeNull();
    expect(r.ema200).toBeNull();
  });

  it('ema200 is defined on 300 candles', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(300));
    expect(r.ema200).not.toBeNull();
    expect(r.ema200).toBeGreaterThan(0);
  });

  it('EMA20 > EMA50 > EMA200 on long uptrend (all defined)', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(300));
    expect(r.ema20).toBeGreaterThan(r.ema50);
    expect(r.ema50).toBeGreaterThan(r.ema200!);
  });

  it('EMA stack reflects downtrend (latest prices lowest)', () => {
    const r = computeTrendIndicators('1d', downtrendCandles(400));
    expect(r.ema200).not.toBeNull();
    // For a falling market ema20 < ema50 < ema200 (most recent EMA = lowest)
    expect(r.ema200).toBeGreaterThan(r.ema50);
    expect(r.ema50).toBeGreaterThan(r.ema20);
    expect(r.adxTrend).toBe('down');
  });

  it('EMAs cluster near base price on flat market', () => {
    const r = computeTrendIndicators('1d', flatCandles(300));
    expect(r.ema20).toBeGreaterThan(95);
    expect(r.ema20).toBeLessThan(105);
    expect(r.ema50).toBeGreaterThan(95);
    expect(r.ema50).toBeLessThan(105);
  });

  it('adxTrend === "up" on strong uptrend with ema200', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(300));
    expect(r.adxTrend).toBe('up');
    expect(r.adx).toBeGreaterThan(0);
  });

  it('adxTrend === "down" on strong downtrend with ema200', () => {
    const r = computeTrendIndicators('1d', downtrendCandles(400));
    expect(r.adxTrend).toBe('down');
    expect(r.adx).toBeGreaterThan(0);
  });

  it('adxTrend is a valid string when ema200 is null', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(150));
    expect(r.ema200).toBeNull();
    expect(['up', 'down', 'sideways']).toContain(r.adxTrend);
  });

  it('output always contains all fields with correct types', () => {
    const r = computeTrendIndicators('1d', uptrendCandles(300));
    expect(typeof r.ema20).toBe('number');
    expect(typeof r.ema50).toBe('number');
    expect(r.ema200 === null || typeof r.ema200 === 'number').toBe(true);
    expect(typeof r.adx).toBe('number');
    expect(['up', 'down', 'sideways']).toContain(r.adxTrend);
  });
});

describe('trendDirectionScore', () => {
  it('returns positive for "up" trend', () => {
    expect(trendDirectionScore({ adxTrend: 'up' } as any)).toBeGreaterThan(0);
  });

  it('returns negative for "down" trend', () => {
    expect(trendDirectionScore({ adxTrend: 'down' } as any)).toBeLessThan(0);
  });

  it('returns 0 for "sideways" trend', () => {
    expect(trendDirectionScore({ adxTrend: 'sideways' } as any)).toBe(0);
  });

  it('score magnitude does not exceed 1', () => {
    expect(Math.abs(trendDirectionScore({ adxTrend: 'up' } as any))).toBeLessThanOrEqual(1);
    expect(Math.abs(trendDirectionScore({ adxTrend: 'down' } as any))).toBeLessThanOrEqual(1);
  });
});
