import { describe, it, expect } from 'vitest';
import {
  realizedVolatility,
  averageTrueRange,
  closeSlope,
  trendStrength,
  returnDispersion,
  volumeAbnormality,
  computeRegimeFeatures,
} from '../regime-features';
import type { CandleLike } from '../regime-types';

function makeCandle(ts: string, close: number, high: number, low: number, volume: number): CandleLike {
  return {
    timestamp: ts,
    open: close,
    high: Math.max(high, close),
    low: Math.min(low, close),
    close,
    volume,
  };
}

describe('regime-features', () => {
  it('returns null for fewer than 2 candles', () => {
    const c = [makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50)];
    expect(realizedVolatility(c)).toBeNull();
    expect(averageTrueRange(c)).toBeNull();
    expect(closeSlope(c)).toBeNull();
    expect(trendStrength(c)).toBeNull();
    expect(returnDispersion(c)).toBeNull();
    expect(volumeAbnormality(c)).toBeNull();
  });

  it('averageTrueRange returns null when subset length < 2 (e.g. n = 1)', () => {
    const c = [
      makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50),
      makeCandle('2025-01-01T01:00:00Z', 101, 102, 100, 50),
    ];
    expect(averageTrueRange(c, 1)).toBeNull();
  });

  it('computes realized volatility as annualized log-return std', () => {
    const c = [
      makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50),
      makeCandle('2025-01-01T01:00:00Z', 101, 102, 100, 55),
      makeCandle('2025-01-01T02:00:00Z', 102, 103, 101, 60),
    ];
    const rv = realizedVolatility(c);
    expect(rv).not.toBeNull();
    expect(rv!).toBeGreaterThan(0);
  });

  it('returns null for realizedVolatility and returnDispersion when valid returns < 2', () => {
    const invalidCandles = [
      makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50),
      makeCandle('2025-01-01T01:00:00Z', -10, 101, 99, 50),
    ];
    expect(realizedVolatility(invalidCandles)).toBeNull();
    expect(returnDispersion(invalidCandles)).toBeNull();
  });

  it('handles zero volume and constant volume in volumeAbnormality', () => {
    const zeroVolCandles = [
      makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 0),
      makeCandle('2025-01-01T01:00:00Z', 101, 102, 100, 0),
    ];
    expect(volumeAbnormality(zeroVolCandles)).toBe(0);

    const constantVolCandles = [
      makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 100),
      makeCandle('2025-01-01T01:00:00Z', 101, 102, 100, 100),
    ];
    expect(volumeAbnormality(constantVolCandles)).toBe(0);
  });

  it('handles flat prices and inside bars in trendStrength and closeSlope', () => {
    const flatCandles = [
      makeCandle('2025-01-01T00:00:00Z', 100, 100, 100, 50),
      makeCandle('2025-01-01T01:00:00Z', 100, 100, 100, 50),
    ];
    expect(trendStrength(flatCandles)).toBe(0);
    expect(closeSlope(flatCandles)).toBe(0);

    // Inside bar: positive true range but zero directional movement (plusDm = minusDm = 0 -> denom = 0)
    const insideBarCandles = [
      makeCandle('2025-01-01T00:00:00Z', 100, 105, 95, 50),
      makeCandle('2025-01-01T01:00:00Z', 100, 104, 96, 50),
    ];
    expect(trendStrength(insideBarCandles)).toBe(0);
  });

  it('computes all features in computeRegimeFeatures', () => {
    const c = [
      makeCandle('2025-01-01T00:00:00Z', 100, 102, 98, 100),
      makeCandle('2025-01-01T01:00:00Z', 101, 103, 99, 120),
      makeCandle('2025-01-01T02:00:00Z', 102, 104, 100, 110),
    ];
    const feat = computeRegimeFeatures(c);
    expect(feat.realizedVol).not.toBeNull();
    expect(feat.atr).not.toBeNull();
    expect(feat.closeSlope).not.toBeNull();
    expect(feat.trendStrength).not.toBeNull();
    expect(feat.returnDispersion).not.toBeNull();
    expect(feat.volumeAbnormality).not.toBeNull();
  });
});
