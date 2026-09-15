/**
 * Tests for regime-detector.ts — detectRegime suite.
 *
 * Verifies:
 *  - detectRegime returns a valid RegimeSnapshot from a Map<TfId, TimeframeIndicators>
 *  - All four regime labels (trending_up, trending_down, ranging, volatile)
 *  - Output fields: regime, regimeConfidence, dominantTf, reason
 *  - RegimeSnapshot.confidence is in [0, 1]
 */

import { describe, it, expect } from 'vitest';
import { detectRegime } from '../regime-detector.js';
import type { TimeframeIndicators } from '../regime-detector.js';
import type { TfId } from '../multi-tf-types.js';
import {
  trendingUpTf,
  trendingDownTf,
  rangingTf,
  volatileTf,
} from './regime-detector-fixtures.js';

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
