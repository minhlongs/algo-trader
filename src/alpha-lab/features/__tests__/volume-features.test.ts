/**
 * Volume Feature Tests
 */

import { describe, it, expect } from 'vitest';
import { VOLUME_FEATURES, computeVolumeZScore, computeRelativeVolume, computeVolumeMomentum } from '../volume-features';
import type { FeatureContext } from '../feature-types';

function makeCandles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 50 + i,
  }));
}

describe('Volume Features', () => {
  const ctx: FeatureContext = {
    market: 'X',
    timeframe: '1h',
    candles: makeCandles(20),
  };

  it('volume_zscore returns finite number', () => {
    const v = computeVolumeZScore(ctx);
    expect(v).not.toBeNull();
    expect(Number.isFinite(v!)).toBe(true);
  });

  it('relative_volume is >= 0 for valid input', () => {
    const v = computeRelativeVolume(ctx);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThanOrEqual(0);
  });

  it('volume_momentum positive for increasing volume', () => {
    const v = computeVolumeMomentum(ctx);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it('registry contains all defined features', () => {
    for (const key of Object.keys(VOLUME_FEATURES)) {
      expect(VOLUME_FEATURES[key]).toBeDefined();
    }
  });
});