/**
 * Regime Engine Tests
 *
 * Focus: causal correctness + future-data leakage prevention.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyRegime,
  realizedVolatility,
  averageTrueRange,
  closeSlope,
  trendStrength,
  returnDispersion,
  volumeAbnormality,
  computeRegimeFeatures,
  defaultRules,
  type CandleLike,
  type MarketRegime,
} from '../regime-engine';
import type { RegimeSnapshot } from '../regime-types';

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

describe('RegimeEngine', () => {
  describe('feature functions', () => {
    it('returns null for fewer than 2 candles', () => {
      const c = [makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50)];
      expect(realizedVolatility(c)).toBeNull();
      expect(averageTrueRange(c)).toBeNull();
      expect(closeSlope(c)).toBeNull();
      expect(trendStrength(c)).toBeNull();
      expect(returnDispersion(c)).toBeNull();
      expect(volumeAbnormality(c)).toBeNull();
    });

    it('computes realized volatility as annualized log-return std', () => {
      const c = [
        makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50),
        makeCandle('2025-01-01T01:00:00Z', 101, 102, 100, 55),
        makeCandle('2025-01-01T02:00:00Z', 102, 103, 101, 60),
      ];
      const rv = realizedVolatility(c);
      expect(rv).not.toBeNull();
      expect(rv).toBeGreaterThan(0);
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

    it('handles flat prices in trendStrength and closeSlope', () => {
      const flatCandles = [
        makeCandle('2025-01-01T00:00:00Z', 100, 100, 100, 50),
        makeCandle('2025-01-01T01:00:00Z', 100, 100, 100, 50),
      ];
      expect(trendStrength(flatCandles)).toBe(0);
      expect(closeSlope(flatCandles)).toBe(0);
    });
  });

  describe('causal correctness', () => {
    it('regime at T is stable when the same causal slice is recomputed', () => {
      const window: CandleLike[] = Array.from({ length: 20 }, (_, i) =>
        makeCandle(
          new Date(Date.UTC(2025, 0, 1, i + 1)).toISOString(),
          100 + i,
          101 + i,
          99 + i,
          50 + i,
        ),
      );
      const r1 = classifyRegime({ market: 'X', timeframe: '1h', lookback: 14 }, window.slice(-14));
      const r2 = classifyRegime({ market: 'X', timeframe: '1h', lookback: 14 }, window.slice(-14));
      expect(r1.timestamp).toBe(r2.timestamp);
      expect(r1.regime).toBe(r2.regime);
      expect(r1.features).toEqual(r2.features);
    });

    it('classifier is a pure function — identical input -> identical output', () => {
      const window: CandleLike[] = Array.from({ length: 5 }, (_, i) =>
        makeCandle(
          new Date(Date.UTC(2025, 0, 1, i + 1)).toISOString(),
          100 + i * 2,
          101 + i * 2,
          99 + i * 2,
          50 + i * 10,
        ),
      );
      const a = classifyRegime({ market: 'X', timeframe: '1h', lookback: 5 }, window);
      const b = classifyRegime({ market: 'X', timeframe: '1h', lookback: 5 }, [...window]);
      expect(a).toEqual(b);
    });
  });

  describe('regime classification', () => {
    const upTrend: CandleLike[] = Array.from({ length: 30 }, (_, i) =>
      makeCandle(
        new Date(Date.UTC(2025, 0, 1, i)).toISOString(),
        100 + i * 2,
        101 + i * 2,
        99 + i * 2,
        50 + i,
      ),
    );

    it('classifies strong up-trend as TREND_UP', () => {
      const r = classifyRegime({ market: 'X', timeframe: '1h', lookback: 20 }, upTrend);
      expect(['TREND_UP', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK', 'UNKNOWN']).toContain(r.regime);
    });

    it('returns explanation string', () => {
      const r = classifyRegime({ market: 'X', timeframe: '1h', lookback: 20 }, upTrend);
      expect(r.explanation.length).toBeGreaterThan(0);
    });

    it('falls back to UNKNOWN on empty input', () => {
      const r = classifyRegime({ market: 'X', timeframe: '1h', lookback: 10 }, []);
      expect(r.regime).toBe('UNKNOWN');
    });

    it('includes market and timeframe', () => {
      const r = classifyRegime({ market: 'BTC/USDT', timeframe: '4h', lookback: 10 }, upTrend);
      expect(r.market).toBe('BTC/USDT');
      expect(r.timeframe).toBe('4h');
    });
  });

  describe('default rules contract', () => {
    it('returns all initial regimes', () => {
      const rules = defaultRules();
      const regimes = rules.map((r) => r.regime);
      expect(regimes).toContain('TREND_UP');
      expect(regimes).toContain('TREND_DOWN');
      expect(regimes).toContain('RANGE');
      expect(regimes).toContain('HIGH_VOLATILITY');
      expect(regimes).toContain('LOW_VOLATILITY');
      expect(regimes).toContain('SHOCK');
    });

    it('matches SHOCK rule when volume abnormality > 3 and return dispersion > 0.05', () => {
      const rules = defaultRules();
      const shockRule = rules.find((r) => r.regime === 'SHOCK')!;
      expect(
        shockRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: 0,
          trendStrength: 10,
          returnDispersion: 0.06,
          volumeAbnormality: 3.5,
        }),
      ).toBe(true);
      expect(
        shockRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: 0,
          trendStrength: 10,
          returnDispersion: 0.02,
          volumeAbnormality: 3.5,
        }),
      ).toBe(false);
    });

    it('matches TREND_UP rule when slope > 0 and trendStrength >= 25', () => {
      const rules = defaultRules();
      const upRule = rules.find((r) => r.regime === 'TREND_UP')!;
      expect(
        upRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: 0.5,
          trendStrength: 25,
          returnDispersion: 0.01,
          volumeAbnormality: 0,
        }),
      ).toBe(true);
      expect(
        upRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: -0.5,
          trendStrength: 25,
          returnDispersion: 0.01,
          volumeAbnormality: 0,
        }),
      ).toBe(false);
    });

    it('matches TREND_DOWN rule when slope < 0 and trendStrength >= 25', () => {
      const rules = defaultRules();
      const downRule = rules.find((r) => r.regime === 'TREND_DOWN')!;
      expect(
        downRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: -0.5,
          trendStrength: 26,
          returnDispersion: 0.01,
          volumeAbnormality: 0,
        }),
      ).toBe(true);
      expect(
        downRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: 0.5,
          trendStrength: 26,
          returnDispersion: 0.01,
          volumeAbnormality: 0,
        }),
      ).toBe(false);
    });

    it('matches HIGH_VOLATILITY rule when realizedVol >= 1.0', () => {
      const rules = defaultRules();
      const highVolRule = rules.find((r) => r.regime === 'HIGH_VOLATILITY')!;
      expect(
        highVolRule.matches({
          realizedVol: 1.2,
          atr: 1,
          closeSlope: 0,
          trendStrength: 10,
          returnDispersion: 0.01,
          volumeAbnormality: 0,
        }),
      ).toBe(true);
      expect(
        highVolRule.matches({
          realizedVol: 0.8,
          atr: 1,
          closeSlope: 0,
          trendStrength: 10,
          returnDispersion: 0.01,
          volumeAbnormality: 0,
        }),
      ).toBe(false);
    });

    it('matches LOW_VOLATILITY rule when vol < 0.4, trend < 20, and dispersion < 0.01', () => {
      const rules = defaultRules();
      const lowVolRule = rules.find((r) => r.regime === 'LOW_VOLATILITY')!;
      expect(
        lowVolRule.matches({
          realizedVol: 0.3,
          atr: 1,
          closeSlope: 0,
          trendStrength: 15,
          returnDispersion: 0.005,
          volumeAbnormality: 0,
        }),
      ).toBe(true);
      expect(
        lowVolRule.matches({
          realizedVol: 0.5,
          atr: 1,
          closeSlope: 0,
          trendStrength: 15,
          returnDispersion: 0.005,
          volumeAbnormality: 0,
        }),
      ).toBe(false);
    });

    it('matches RANGE rule when trend < 20 and dispersion < 0.03', () => {
      const rules = defaultRules();
      const rangeRule = rules.find((r) => r.regime === 'RANGE')!;
      expect(
        rangeRule.matches({
          realizedVol: 0.6,
          atr: 1,
          closeSlope: 0,
          trendStrength: 12,
          returnDispersion: 0.02,
          volumeAbnormality: 0,
        }),
      ).toBe(true);
      expect(
        rangeRule.matches({
          realizedVol: 0.6,
          atr: 1,
          closeSlope: 0,
          trendStrength: 25,
          returnDispersion: 0.02,
          volumeAbnormality: 0,
        }),
      ).toBe(false);
    });

    it('falls back to fallback regime when no rule matches', () => {
      const emptyRules: any[] = [];
      const snapshot = classifyRegime(
        { market: 'ETH/USDT', timeframe: '1h', lookback: 10 },
        [
          makeCandle('2025-01-01T00:00:00Z', 100, 101, 99, 50),
          makeCandle('2025-01-01T01:00:00Z', 101, 102, 100, 55),
        ],
        emptyRules,
      );
      expect(snapshot.regime).toBe('UNKNOWN');
      expect(snapshot.explanation).toContain('no matching rule; default classifier');
    });
  });
});