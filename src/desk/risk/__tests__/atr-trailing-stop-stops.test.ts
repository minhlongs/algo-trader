/**
 * ATR Trailing Stop-Loss — long and short stop calculations
 */
import { describe, it, expect } from 'vitest';
import { AtrTrailingStop } from '../atr-trailing-stop';
import { uptrendCandles } from './atr-trailing-stop-fixtures';

describe('AtrTrailingStop stop levels', () => {
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
});
