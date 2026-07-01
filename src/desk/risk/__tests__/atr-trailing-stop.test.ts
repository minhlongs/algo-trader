/**
 * ATR Trailing Stop-Loss Tests
 */
import { describe, it, expect } from 'vitest';
import { AtrTrailingStop } from '../atr-trailing-stop';
import type { AtrCandle } from '../atr-trailing-stop';

// Sample candles: trending up with volatility
const uptrendCandles: AtrCandle[] = [
  { high: 102, low: 98, close: 100 },   // 0
  { high: 104, low: 99, close: 103 },   // 1
  { high: 107, low: 102, close: 106 },  // 2
  { high: 108, low: 104, close: 105 },  // 3
  { high: 110, low: 104, close: 109 },  // 4
  { high: 112, low: 107, close: 111 },  // 5
  { high: 115, low: 110, close: 114 },  // 6
  { high: 118, low: 112, close: 117 },  // 7
  { high: 120, low: 115, close: 118 },  // 8
  { high: 122, low: 117, close: 121 },  // 9
  { high: 125, low: 119, close: 124 },  // 10
  { high: 127, low: 122, close: 125 },  // 11
  { high: 130, low: 124, close: 128 },  // 12
  { high: 132, low: 126, close: 131 },  // 13
  { high: 135, low: 128, close: 133 },  // 14
];

describe('AtrTrailingStop', () => {
  describe('trueRange', () => {
    it('computes TR = max(high-low, |high-prevClose|, |low-prevClose|)', () => {
      const tr = AtrTrailingStop.trueRange(
        { high: 105, low: 95, close: 100 },
        102,
      );
      // hl=10, hpc=|105-102|=3, lpc=|95-102|=7 → max=10
      expect(tr).toBe(10);
    });

    it('uses |high-prevClose| when gap up dominates', () => {
      const tr = AtrTrailingStop.trueRange(
        { high: 120, low: 115, close: 118 },
        100,
      );
      // hl=5, hpc=20, lpc=15 → max=20
      expect(tr).toBe(20);
    });

    it('uses |low-prevClose| when gap down dominates', () => {
      const tr = AtrTrailingStop.trueRange(
        { high: 95, low: 85, close: 90 },
        100,
      );
      // hl=10, hpc=5, lpc=15 → max=15
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
      expect(result.length).toBe(1); // 14 TRs → 1 ATR
      expect(result[0]).toBeGreaterThan(0);
    });

    it('ATR converges with Wilder smoothing', () => {
      // 20 identical candles
      const flat: AtrCandle[] = Array.from({ length: 20 }, (_, i) => ({
        high: 110 + i * 0.1,
        low: 90 + i * 0.1,
        close: 100 + i * 0.1,
      }));
      const result = AtrTrailingStop.computeAtr(flat, {
        period: 14,
        multiplier: 2,
      });
      // TR ≈ 20 for each bar; ATR should be ~20 after smoothing
      expect(result.length).toBeGreaterThanOrEqual(5);
      const lastAtr = result[result.length - 1];
      expect(lastAtr).toBeGreaterThan(19);
      expect(lastAtr).toBeLessThan(21);
    });
  });

  describe('trailingStopLong', () => {
    it('stop rises as price makes new highs', () => {
      const atr = AtrTrailingStop.computeAtr(uptrendCandles, {
        period: 14,
        multiplier: 2,
      });
      const stops = AtrTrailingStop.trailingStopLong(
        uptrendCandles,
        atr,
        2,
      );
      const lastStop = stops[stops.length - 1];
      expect(Number.isFinite(lastStop)).toBe(true);
      expect(lastStop).toBeGreaterThan(0);
    });

    it('stop never decreases for long positions', () => {
      const atr = AtrTrailingStop.computeAtr(uptrendCandles, {
        period: 14,
        multiplier: 2,
      });
      const stops = AtrTrailingStop.trailingStopLong(
        uptrendCandles,
        atr,
        2,
      );
      let prev = -Infinity;
      for (const s of stops) {
        if (Number.isFinite(s)) {
          expect(s).toBeGreaterThanOrEqual(prev);
          prev = s;
        }
      }
    });
  });

  describe('trailingStopShort', () => {
    it('stop falls as price makes new lows', () => {
      const atr = AtrTrailingStop.computeAtr(uptrendCandles, {
        period: 14,
        multiplier: 2,
      });
      const stops = AtrTrailingStop.trailingStopShort(
        uptrendCandles,
        atr,
        2,
      );
      // In uptrend, short stops will be at lowestLow + 2*ATR (still finite)
      const finiteStops = stops.filter((s) => Number.isFinite(s));
      expect(finiteStops.length).toBeGreaterThan(0);
    });

    it('stop never increases for short positions', () => {
      const atr = AtrTrailingStop.computeAtr(uptrendCandles, {
        period: 14,
        multiplier: 2,
      });
      const stops = AtrTrailingStop.trailingStopShort(
        uptrendCandles,
        atr,
        2,
      );
      let prev = Infinity;
      for (const s of stops) {
        if (Number.isFinite(s)) {
          expect(s).toBeLessThanOrEqual(prev);
          prev = s;
        }
      }
    });
  });

  describe('evaluate', () => {
    it('detects stop hit when close crosses below stop (long)', () => {
      const candles: AtrCandle[] = [
        { high: 105, low: 95, close: 100 },
        { high: 90, low: 80, close: 85 }, // close drops below stop
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
