/**
 * Tests for indicators-microstructure pipeline and timeframe gating.
 * Covers isMicroTf and computeMicroIndicators.
 */

import { describe, it, expect } from 'vitest';
import {
  isMicroTf,
  computeOBI,
  computeVWAP,
  computeDeltaCandle,
  computeMicroIndicators,
} from '../indicators-microstructure.js';
import { c, defaultCandles } from './indicators-microstructure-fixtures.js';

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

describe('computeMicroIndicators', () => {
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
    const candles = [
      c({ high: 110, low: 90, close: 100, volume: 1 }),
      c({ high: 110, low: 90, close: 100, volume: 100 }),
    ];
    expect(computeMicroIndicators('1m', candles, 0, 0).vwap).toBeCloseTo(100, 6);
  });

  it('deltaCandle uses only the last candle', () => {
    const candles = [
      c({ open: 100, close: 80, volume: 1 }),
      c({ open: 80, close: 120, volume: 1 }),
    ];
    const result = computeMicroIndicators('1m', candles, 0, 0);
    expect(result.deltaCandle).toBeCloseTo(computeDeltaCandle(candles[1]), 10);
  });

  it('defaults bidVol and askVol to 0 when omitted', () => {
    const result = computeMicroIndicators('1m', defaultCandles);
    expect(result.obi).toBeCloseTo(computeOBI(0, 0), 10);
  });
});
