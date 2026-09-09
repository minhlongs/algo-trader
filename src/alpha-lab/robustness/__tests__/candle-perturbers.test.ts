import { describe, it, expect } from 'vitest';
import { dropCandles, delayCandles } from '../candle-perturbers';

describe('dropCandles', () => {
  it('returns same array when fraction is 0 or negative', () => {
    const candles = [{ timestamp: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    expect(dropCandles(candles, 0, 42)).toEqual(candles);
    expect(dropCandles(candles, -0.5, 42)).toEqual(candles);
  });

  it('reduces length when fraction > 0', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 1,
    }));
    const result = dropCandles(candles, 0.2, 42);
    expect(result.length).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(50);
  });

  it('preserves order', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: `t${i}`, open: i, high: i, low: i, close: i, volume: 1,
    }));
    const result = dropCandles(candles, 0.3, 42);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].open).toBeGreaterThan(result[i - 1].open);
    }
  });

  it('is deterministic for same seed', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 1,
    }));
    const a = dropCandles(candles, 0.2, 42);
    const b = dropCandles(candles, 0.2, 42);
    expect(a.length).toBe(b.length);
  });
});

describe('delayCandles', () => {
  it('removes first N candles', () => {
    const candles = Array.from({ length: 50 }, (_, i) => ({
      timestamp: `t${i}`, open: i, high: i, low: i, close: i, volume: 1,
    }));
    const result = delayCandles(candles, 5);
    expect(result.length).toBe(45);
    expect(result[0].open).toBe(5);
  });

  it('returns same array when delay is 0 or negative', () => {
    const candles = [{ timestamp: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    expect(delayCandles(candles, 0)).toEqual(candles);
    expect(delayCandles(candles, -5)).toEqual(candles);
  });
});
