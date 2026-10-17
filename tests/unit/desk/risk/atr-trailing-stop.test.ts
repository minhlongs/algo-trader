import { describe, expect, it } from 'vitest';
import { AtrTrailingStop, AtrCandle } from '../../../../src/desk/risk/atr-trailing-stop';

describe('AtrTrailingStop', () => {
  const candles: AtrCandle[] = [
    { high: 105, low: 95, close: 100 },
    { high: 110, low: 98, close: 108 },
    { high: 112, low: 102, close: 105 },
    { high: 115, low: 104, close: 114 },
    { high: 118, low: 110, close: 115 },
  ];

  it('computes true range correctly', () => {
    const tr = AtrTrailingStop.trueRange({ high: 110, low: 98, close: 108 }, 100);
    // hl = 12, hpc = |110 - 100| = 10, lpc = |98 - 100| = 2 -> max is 12
    expect(tr).toBe(12);
  });

  it('computes ATR with Wilder smoothing', () => {
    const testCandles: AtrCandle[] = Array.from({ length: 20 }, (_, i) => ({
      high: 100 + i + 2,
      low: 100 + i - 2,
      close: 100 + i,
    }));
    const atrs = AtrTrailingStop.computeAtr(testCandles, { period: 5, multiplier: 2.0 });
    expect(atrs.length).toBeGreaterThan(0);
    expect(atrs[0]).toBeGreaterThan(0);
  });

  it('evaluates long trailing stops tightening upwards', () => {
    const atrs = [4, 4, 4, 4, 4];
    const stops = AtrTrailingStop.trailingStopLong(candles, atrs, 2.0);
    expect(stops.length).toBe(candles.length);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]).toBeGreaterThanOrEqual(stops[i - 1]!);
    }
    const evalRes = AtrTrailingStop.evaluate(candles, stops, 'long', 4);
    expect(evalRes.stopped).toBe(false);
  });

  it('evaluates short trailing stops tightening downwards', () => {
    const atrs = [4, 4, 4, 4, 4];
    const stops = AtrTrailingStop.trailingStopShort(candles, atrs, 2.0);
    expect(stops.length).toBe(candles.length);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]).toBeLessThanOrEqual(stops[i - 1]!);
    }
  });
});
