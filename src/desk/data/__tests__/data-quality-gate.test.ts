/**
 * Data Quality Gate Tests — timeframeToMs + runDataQualityGate
 * Validates candle-series quality detection: gaps, duplicates, OHLC invariant, price jumps, warnings.
 */
import { describe, it, expect, vi } from 'vitest';
import { runDataQualityGate, timeframeToMs } from '../data-quality-gate';
import { HOUR, BASE, makeCleanCandles } from './data-quality-gate-fixtures';
import type { OhlcvCandle } from '../ohlcv-store';

vi.mock('../ohlcv-store', () => ({
  getHistoricalData: vi.fn(),
}));

describe('timeframeToMs', () => {
  it('maps known timeframes and returns undefined for unknown', () => {
    expect(timeframeToMs('1h')).toBe(HOUR);
    expect(timeframeToMs('1m')).toBe(60_000);
    expect(timeframeToMs('1d')).toBe(86_400_000);
    expect(timeframeToMs('99x')).toBeUndefined();
  });
});

describe('runDataQualityGate', () => {
  it('passes a clean dataset', () => {
    const report = runDataQualityGate(makeCleanCandles(50));
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.candleCount).toBe(50);
    expect(report.coveragePct).toBeCloseTo(1, 5);
  });

  it('fails on empty dataset', () => {
    const report = runDataQualityGate([]);
    expect(report.passed).toBe(false);
    expect(report.candleCount).toBe(0);
  });

  it('detects a gap (> 1 timeframe interval)', () => {
    const candles = makeCleanCandles(10);
    candles.splice(4, 3);
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'gap')).toBe(true);
    expect(report.coveragePct).toBeLessThan(1);
  });

  it('detects duplicate timestamps', () => {
    const candles = makeCleanCandles(10);
    candles[5] = { ...candles[5], timestamp: candles[4].timestamp };
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'duplicate-timestamp')).toBe(true);
  });

  it('detects OHLC invariant corruption', () => {
    const candles = makeCleanCandles(10);
    candles[5] = { ...candles[5], open: 100, close: 110, high: 105, low: 99 };
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'ohlc-invariant')).toBe(true);
  });

  it('detects negative volume', () => {
    const candles = makeCleanCandles(10);
    candles[3] = { ...candles[3], volume: -1 };
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'negative-volume')).toBe(true);
  });

  it('detects out-of-order timestamps as a gap violation', () => {
    const candles = makeCleanCandles(10);
    const tmp = candles[4];
    candles[4] = candles[5];
    candles[5] = tmp;
    const report = runDataQualityGate(candles);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'gap')).toBe(true);
  });

  it('detects a price jump exceeding N x ATR', () => {
    const candles: OhlcvCandle[] = [];
    for (let i = 0; i < 30; i++) {
      candles.push({
        market: 'BTC/USD', exchange: 'binance', timeframe: '1h',
        timestamp: new Date(BASE + i * HOUR),
        open: 100, high: 100.1, low: 99.9, close: 100, volume: 1000,
      });
    }
    const last = candles[candles.length - 1];
    candles.push({
      ...last, timestamp: new Date(last.timestamp.getTime() + HOUR),
      open: 100, high: 150, low: 100, close: 150,
    });
    const report = runDataQualityGate(candles, { priceJumpAtrMultiple: 10 });
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'price-jump')).toBe(true);
  });

  it('does not flag a normal price move as a jump', () => {
    const report = runDataQualityGate(makeCleanCandles(50), { priceJumpAtrMultiple: 10 });
    expect(report.violations.some((v) => v.code === 'price-jump')).toBe(false);
  });

  it('warns on a long zero-volume streak but still passes', () => {
    const candles = makeCleanCandles(40);
    for (let i = 10; i < 35; i++) candles[i] = { ...candles[i], volume: 0 };
    const report = runDataQualityGate(candles, { zeroVolumeStreakThreshold: 20 });
    expect(report.passed).toBe(true);
    expect(report.warnings.some((w) => w.code === 'zero-volume-streak')).toBe(true);
  });

  it('warns on low coverage from a gap', () => {
    const candles = makeCleanCandles(10);
    candles.splice(4, 3);
    const report = runDataQualityGate(candles, { minCoverage: 0.9 });
    expect(report.warnings.some((w) => w.code === 'low-coverage')).toBe(true);
  });

  it('skips gap detection and warns on unknown timeframe', () => {
    const candles = makeCleanCandles(10).map((c) => ({ ...c, timeframe: '99x' }));
    const report = runDataQualityGate(candles);
    expect(report.warnings.some((w) => w.code === 'unknown-timeframe')).toBe(true);
    expect(report.violations.filter((v) => v.code === 'gap')).toHaveLength(0);
  });

  it('respects an explicit timeframeMs override', () => {
    const candles = makeCleanCandles(10).map((c) => ({ ...c, timeframe: '99x' }));
    candles.splice(4, 3);
    const report = runDataQualityGate(candles, { timeframeMs: HOUR });
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.code === 'gap')).toBe(true);
  });

  it('is deterministic for identical input', () => {
    const candles = makeCleanCandles(30);
    expect(runDataQualityGate(candles)).toEqual(runDataQualityGate(candles));
  });
});
