/**
 * Tests for regime-detector.ts.
 *
 * Verifies:
 *  - detectRegime returns a valid RegimeSnapshot from a Map<TfId, TimeframeIndicators>
 *  - All four regime labels (trending_up, trending_down, ranging, volatile)
 *  - Output fields: regime, regimeConfidence, dominantTf, reason
 *  - RegimeSnapshot.confidence is in [0, 1]
 *  - isRegimeFresh helper
 */

import { describe, it, expect } from 'vitest';
import { detectRegime, isRegimeFresh } from '../regime-detector';
import type { TimeframeIndicators, RegimeSnapshot } from '../regime-detector';
import type { Candle, TfId } from '../multi-tf-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCandle(close: number): Candle {
  return {
    timestamp: Date.now(),
    open: close,
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume: 100,
  };
}

function candlesFor(count: number, base: number): Candle[] {
  return Array.from({ length: count }, (_, i) => makeCandle(base + i * 0.5));
}

function baseTf(tf: TfId): Omit<TimeframeIndicators, 'trend' | 'momentum' | 'volatility' | 'microstructure'> {
  return {
    tf,
    candles: candlesFor(210, 100),
    computedAt: Date.now(),
  };
}

// trending_up: ema20>ema50, adx strong, adxTrend=up
function trendingUpTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 210, ema50: 200, ema200: 180, adx: 35, adxTrend: 'up' },
    momentum: { rsi: 65, macdLine: 1.2, macdSignal: 0.8, macdHist: 0.4 },
    volatility: { atr: 1.5, atrPct: 0.5, bollingerUpper: 215, bollingerMid: 205, bollingerLower: 195, bollingerWidthPct: 0.095 },
    microstructure: { obi: 0.4, vwap: 205, deltaCandle: 50 },
  };
}

// trending_down
function trendingDownTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 190, ema50: 200, ema200: 220, adx: 30, adxTrend: 'down' },
    momentum: { rsi: 35, macdLine: -1.0, macdSignal: -0.6, macdHist: -0.4 },
    volatility: { atr: 1.4, atrPct: 0.45, bollingerUpper: 195, bollingerMid: 200, bollingerLower: 205, bollingerWidthPct: 0.048 },
    microstructure: { obi: -0.3, vwap: 195, deltaCandle: -40 },
  };
}

// ranging (weak adx, ema20 ~ ema50)
function rangingTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 200, ema50: 200, ema200: 200, adx: 15, adxTrend: 'sideways' },
    momentum: { rsi: 50, macdLine: 0.1, macdSignal: 0.0, macdHist: 0.1 },
    volatility: { atr: 1.0, atrPct: 0.35, bollingerUpper: 205, bollingerMid: 200, bollingerLower: 195, bollingerWidthPct: 0.05 },
    microstructure: { obi: 0.05, vwap: 200, deltaCandle: 5 },
  };
}

// volatile (atrPct >= 4 to trigger threshold)
function volatileTf(tf: TfId): TimeframeIndicators {
  return {
    ...baseTf(tf),
    trend: { ema20: 210, ema50: 205, ema200: 190, adx: 20, adxTrend: 'sideways' },
    momentum: { rsi: 55, macdLine: 0.5, macdSignal: 0.4, macdHist: 0.1 },
    volatility: { atr: 10, atrPct: 5, bollingerUpper: 240, bollingerMid: 200, bollingerLower: 160, bollingerWidthPct: 0.40 },
    microstructure: { obi: 0.1, vwap: 200, deltaCandle: 10 },
  };
}

// ─── detectRegime tests ──────────────────────────────────────────────────────

describe('detectRegime', () => {
  // -- Output shape ----------------------------------------------------------
  it('returns a RegimeSnapshot with required fields', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', trendingUpTf('1d')],
      ['4h', trendingUpTf('4h')],
    ]), Date.now());
    expect(typeof out.regime).toBe('string');
    expect(typeof out.regimeConfidence).toBe('number');
    expect(typeof out.dominantTf).toBe('string');
    expect(typeof out.reason).toBe('string');
  });

  it('regimeConfidence is in [0, 1]', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', trendingUpTf('1d')],
      ['4h', trendingUpTf('4h')],
    ]), Date.now());
    expect(out.regimeConfidence).toBeGreaterThanOrEqual(0);
    expect(out.regimeConfidence).toBeLessThanOrEqual(1);
  });

  it('reason is a non-empty string', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', trendingUpTf('1d')],
      ['4h', rangingTf('4h')],
    ]), Date.now());
    expect(out.reason.length).toBeGreaterThan(0);
  });

  // -- Regime labels ---------------------------------------------------------
  it('multiple trending_up TFs -> trending_up regime', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', trendingUpTf('1d')],
      ['4h', trendingUpTf('4h')],
      ['1h', trendingUpTf('1h')],
    ]), Date.now());
    expect(out.regime).toBe('trending_up');
  });

  it('multiple trending_down TFs -> trending_down regime', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', trendingDownTf('1d')],
      ['4h', trendingDownTf('4h')],
      ['1h', trendingDownTf('1h')],
    ]), Date.now());
    expect(out.regime).toBe('trending_down');
  });

  it('multiple ranging TFs -> ranging regime', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', rangingTf('1d')],
      ['4h', rangingTf('4h')],
      ['1h', rangingTf('1h')],
    ]), Date.now());
    expect(out.regime).toBe('ranging');
  });

  it('all TFs with high atrPct -> volatile regime', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', volatileTf('1d')],
      ['4h', volatileTf('4h')],
      ['1h', volatileTf('1h')],
    ]), Date.now());
    expect(out.regime).toBe('volatile');
  });

  // -- Reason includes regime ------------------------------------------------
  it('reason surfaces the regime and dominantTf', () => {
    const out = detectRegime(new Map<TfId, TimeframeIndicators>([
      ['1d', trendingUpTf('1d')],
      ['4h', trendingUpTf('4h')],
      ['1h', trendingUpTf('1h')],
    ]), Date.now());
    expect(out.reason).toContain('regime=trending_up');
    expect(out.dominantTf).toBe('1d');
  });

  // -- Confidence: agreement fraction ------------------------------------------
  it('regime confidence is the fraction of TFs agreeing with the dominant', () => {
    const aligned = detectRegime(
      new Map<TfId, TimeframeIndicators>([
        ['1d', trendingUpTf('1d')],
        ['4h', trendingUpTf('4h')],
        ['1h', trendingUpTf('1h')],
      ]),
      Date.now(),
    );
    const mixed = detectRegime(
      new Map<TfId, TimeframeIndicators>([
        ['1d', trendingUpTf('1d')],
        ['4h', rangingTf('4h')],
        ['1h', rangingTf('1h')],
      ]),
      Date.now(),
    );
    // aligned: all 3 agree with 1d (up) -> conf ~1.0
    // mixed: only 1/3 agree with 1d (up) -> conf ~0.33
    expect(aligned.regimeConfidence).toBeGreaterThan(mixed.regimeConfidence);
  });
});

// ─── isRegimeFresh tests ─────────────────────────────────────────────────────

describe('isRegimeFresh', () => {
  it('returns true when validUntil is null (no expiry)', () => {
    const snap: RegimeSnapshot = {
      regime: 'trending_up',
      regimeConfidence: 0.8,
      dominantTf: '1d',
      validFrom: Date.now(),
      validUntil: null,
      reason: 'no expiry',
    };
    expect(isRegimeFresh(snap, Date.now())).toBe(true);
  });

  it('returns true when now is before validUntil', () => {
    const snap: RegimeSnapshot = {
      regime: 'trending_up',
      regimeConfidence: 0.8,
      dominantTf: '1d',
      validFrom: Date.now(),
      validUntil: Date.now() + 60_000,
      reason: 'fresh',
    };
    expect(isRegimeFresh(snap, Date.now() + 30_000)).toBe(true);
  });

  it('returns false when now is past validUntil', () => {
    const snap: RegimeSnapshot = {
      regime: 'trending_up',
      regimeConfidence: 0.8,
      dominantTf: '1d',
      validFrom: Date.now(),
      validUntil: Date.now() + 30_000,
      reason: 'about to expire',
    };
    expect(isRegimeFresh(snap, Date.now() + 60_000)).toBe(false);
  });

  it('returns false exactly at validUntil boundary (strict less-than)', () => {
    const ts = Date.now();
    const snap: RegimeSnapshot = {
      regime: 'ranging',
      regimeConfidence: 0.5,
      dominantTf: '1d',
      validFrom: ts,
      validUntil: ts + 10_000,
      reason: 'boundary',
    };
    expect(isRegimeFresh(snap, ts + 10_000)).toBe(false);
  });
});
