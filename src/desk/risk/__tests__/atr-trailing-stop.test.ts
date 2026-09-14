/**
 * ATR Trailing Stop-Loss — true range, ATR calculation, and evaluation tests
 */
import { describe, it, expect } from 'vitest';
import { AtrTrailingStop } from '../atr-trailing-stop';
import type { AtrCandle } from '../atr-trailing-stop';
import { uptrendCandles } from './atr-trailing-stop-fixtures';

describe('AtrTrailingStop', () => {
  describe('trueRange', () => {
    it('computes TR = max(high-low, |high-prevClose|, |low-prevClose|)', () => {
      const tr = AtrTrailingStop.trueRange(
        { high: 105, low: 95, close: 100 },
        102,
      );
      expect(tr).toBe(10);
    });

    it('uses |high-prevClose| when gap up dominates', () => {
      const tr = AtrTrailingStop.trueRange(
        { high: 120, low: 115, close: 118 },
        100,
      );
      expect(tr).toBe(20);
    });

    it('uses |low-prevClose| when gap down dominates', () => {
      const tr = AtrTrailingStop.trueRange(
        { high: 95, low: 85, close: 90 },
        100,
      );
      expect(tr).toBe(15);
    });
  });

  describe('computeAtr', () => {
    it('returns empty for insufficient candles', () => {
      const result = AtrTrailingStop.computeAtr(
        uptrendCandles.slice(0, 5),
        { period: 14, multiplier: 2 },
      );
      expect(result).toEqual([]);
    });

    it('computes ATR for 15 candles with period=14', () => {
      const result = AtrTrailingStop.computeAtr(uptrendCandles, {
        period: 14,
        multiplier: 2,
      });
      expect(result.length).toBe(1);
      expect(result[0]).toBeGreaterThan(0);
    });

    it('ATR converges with Wilder smoothing', () => {
      const flat: AtrCandle[] = Array.from({ length: 20 }, (_, i) => ({
        high: 110 + i * 0.1,
        low: 90 + i * 0.1,
        close: 100 + i * 0.1,
      }));
      const result = AtrTrailingStop.computeAtr(flat, {
        period: 14,
        multiplier: 2,
      });
      expect(result.length).toBeGreaterThanOrEqual(5);
      const lastAtr = result[result.length - 1];
      expect(lastAtr).toBeGreaterThan(19);
      expect(lastAtr).toBeLessThan(21);
    });
  });

  describe('evaluate', () => {
    it('detects stop hit when close crosses below stop (long)', () => {
      const candles: AtrCandle[] = [
        { high: 105, low: 95, close: 100 },
        { high: 90, low: 80, close: 85 },
      ];
      const stops = [95, 90];
      const result = AtrTrailingStop.evaluate(candles, stops, 'long');
      expect(result.stopped).toBe(true);
      expect(result.direction).toBe('long');
    });

    it('no stop hit when close stays above stop (long)', () => {
      const candles: AtrCandle[] = [
        { high: 105, low: 95, close: 100 },
        { high: 110, low: 102, close: 108 },
      ];
      const stops = [90, 92];
      const result = AtrTrailingStop.evaluate(candles, stops, 'long');
      expect(result.stopped).toBe(false);
    });

    it('detects stop hit when close rises above stop (short)', () => {
      const candles: AtrCandle[] = [
        { high: 105, low: 95, close: 100 },
        { high: 115, low: 108, close: 112 },
      ];
      const stops = [108, 107];
      const result = AtrTrailingStop.evaluate(candles, stops, 'short');
      expect(result.stopped).toBe(true);
    });

    it('no stop hit when close stays below stop (short)', () => {
      const candles: AtrCandle[] = [
        { high: 95, low: 85, close: 90 },
        { high: 90, low: 82, close: 86 },
      ];
      const stops = [96, 95];
      const result = AtrTrailingStop.evaluate(candles, stops, 'short');
      expect(result.stopped).toBe(false);
    });

    it('handles empty arrays gracefully', () => {
      const result = AtrTrailingStop.evaluate([], [], 'long');
      expect(result.stopped).toBe(false);
      expect(result.stop).toBe(0);
    });
  });
});
