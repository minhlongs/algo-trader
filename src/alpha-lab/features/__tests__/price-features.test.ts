/**
 * Price Feature Tests
 *
 * Causal correctness + value ranges.
 */

import { describe, it, expect } from 'vitest';
import {
  PRICE_FEATURES,
  computeSimpleReturn,
  computeLogReturn,
  computeAtr,
  computeRealizedVolatility,
  computeMomentum,
  computeMaDistance,
  computeBreakoutState,
} from '../price-features';
import type { FeatureContext } from '../feature-types';

function makeCandles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
}

describe('Price Features', () => {
  const ctx: FeatureContext = {
    market: 'X',
    timeframe: '1h',
    candles: makeCandles(20),
  };

  it('simple_return is positive for monotone up closes', () => {
    const v = computeSimpleReturn({ ...ctx, candles: makeCandles(2) });
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it('log_return is null for non-positive prices', () => {
    const v = computeLogReturn({
      market: 'X',
      timeframe: '1h',
      candles: [
        { timestamp: '2025-01-01T00:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 1 },
        { timestamp: '2025-01-01T01:00:00Z', open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ],
    });
    expect(v).toBeNull();
  });

  it('atr is non-negative for valid window', () => {
    const v = computeAtr(ctx);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThanOrEqual(0);
  });

  it('realized_volatility is non-negative for valid window', () => {
    const v = computeRealizedVolatility(ctx);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThanOrEqual(0);
  });

  it('momentum is positive for up candles', () => {
    const v = computeMomentum(ctx);
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
  });

  it('ma_distance is zero for flat closes', () => {
    const flat = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 10,
    }));
    const v = computeMaDistance({ market: 'X', timeframe: '1h', candles: flat });
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(0, 6);
  });

  it('breakout_state detects breakout above prior high', () => {
    const candles = [
      { timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 101, high: 102, low: 100, close: 101, volume: 10 },
      { timestamp: '2025-01-01T02:00:00Z', open: 102, high: 103, low: 101, close: 103, volume: 10 },
    ];
    const v = computeBreakoutState({ market: 'X', timeframe: '1h', candles });
    expect(v).toBe(1);
  });

  it('registry contains all defined features', () => {
    for (const key of Object.keys(PRICE_FEATURES)) {
      expect(PRICE_FEATURES[key]).toBeDefined();
    }
  });
});
// ── Guard / null branches ────────────────────────────────────────────────────

const ctx = (candles: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume?: number }>) => ({
  market: 'X',
  timeframe: '1h',
  candles,
});

describe('price feature guards', () => {
  it('simple_return is null on a single candle', () => {
    const v = computeSimpleReturn(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('simple_return is null for non-positive prices', () => {
    const v = computeSimpleReturn(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 0, high: 0, low: 0, close: 5, volume: 10 },
    ]));
    expect(v).toBeNull();
  });

  it('log_return is null for non-positive prices across two candles', () => {
    const v = computeLogReturn(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 0, high: 0, low: 0, close: 5, volume: 10 },
    ]));
    expect(v).toBeNull();
  });

  it('log_return is null on a single candle', () => {
    const v = computeLogReturn(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('log_return is positive for monotone up closes', () => {
    const v = computeLogReturn(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 101, high: 102, low: 100, close: 110, volume: 10 },
    ]));
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
    expect(v!).toBeCloseTo(Math.log(1.1), 6);
  });

  it('log_return is null when only the current close is non-positive', () => {
    const v = computeLogReturn(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
    ]));
    expect(v).toBeNull();
  });

  it('atr is null on a single candle', () => {
    const v = computeAtr(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('realized_volatility is null on a single candle', () => {
    const v = computeRealizedVolatility(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('realized_volatility is null when all prices are non-positive', () => {
    const v = computeRealizedVolatility(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
    ]));
    expect(v).toBeNull();
  });

  it('momentum is null on a single candle', () => {
    const v = computeMomentum(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('momentum is null for non-positive prices', () => {
    const v = computeMomentum(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 0, high: 0, low: 0, close: 5, volume: 10 },
    ]));
    expect(v).toBeNull();
  });

  it('ma_distance is null on a single candle', () => {
    const v = computeMaDistance(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('ma_distance is null for non-positive closes', () => {
    const v = computeMaDistance(ctx([
      { timestamp: '2025-01-01T00:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 0, high: 0, low: 0, close: 0, volume: 10 },
    ]));
    expect(v).toBeNull();
  });

  it('breakout_state is null on a single candle', () => {
    const v = computeBreakoutState(ctx([{ timestamp: '2025-01-01T00:00:00Z', open: 100, high: 101, low: 99, close: 100, volume: 10 }]));
    expect(v).toBeNull();
  });

  it('breakout_state detects breakdown below prior low', () => {
    const candles = [
      { timestamp: '2025-01-01T00:00:00Z', open: 100, high: 102, low: 98, close: 100, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 99, high: 100, low: 97, close: 99, volume: 10 },
      { timestamp: '2025-01-01T02:00:00Z', open: 98, high: 99, low: 95, close: 96, volume: 10 },
    ];
    expect(computeBreakoutState(ctx(candles))).toBe(-1);
  });

  it('breakout_state returns 0 inside the prior range', () => {
    const candles = [
      { timestamp: '2025-01-01T00:00:00Z', open: 100, high: 105, low: 95, close: 100, volume: 10 },
      { timestamp: '2025-01-01T01:00:00Z', open: 101, high: 106, low: 96, close: 101, volume: 10 },
      { timestamp: '2025-01-01T02:00:00Z', open: 102, high: 103, low: 97, close: 100, volume: 10 },
    ];
    expect(computeBreakoutState(ctx(candles))).toBe(0);
  });
});
