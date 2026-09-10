import { describe, it, expect } from 'vitest';
import {
  classifyRegime,
  defaultRules,
  pickRegime,
  buildExplanation,
} from '../regime-engine';
import type { CandleLike, RegimeRule } from '../regime-types';

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

describe('regime-engine classification and rules', () => {
  const upTrend: CandleLike[] = Array.from({ length: 30 }, (_, i) =>
    makeCandle(
      new Date(Date.UTC(2025, 0, 1, i)).toISOString(),
      100 + i * 2,
      101 + i * 2,
      99 + i * 2,
      50 + i,
    ),
  );

  it('regime at T is stable and pure function', () => {
    const r1 = classifyRegime({ market: 'X', timeframe: '1h', lookback: 14 }, upTrend.slice(-14));
    const r2 = classifyRegime({ market: 'X', timeframe: '1h', lookback: 14 }, upTrend.slice(-14));
    expect(r1.timestamp).toBe(r2.timestamp);
    expect(r1.regime).toBe(r2.regime);
    expect(r1.features).toEqual(r2.features);
  });

  it('classifies strong up-trend and returns explanation', () => {
    const r = classifyRegime({ market: 'BTC/USDT', timeframe: '4h', lookback: 20 }, upTrend);
    expect(r.explanation.length).toBeGreaterThan(0);
    expect(r.market).toBe('BTC/USDT');
    expect(r.timeframe).toBe('4h');
  });

  it('falls back to UNKNOWN on empty input', () => {
    const r = classifyRegime({ market: 'X', timeframe: '1h', lookback: 10 }, []);
    expect(r.regime).toBe('UNKNOWN');
    expect(r.explanation).toBe('No candles provided');
  });

  it('matches SHOCK, TREND_UP, and TREND_DOWN rules exhaustively', () => {
    const rules = defaultRules();
    const shock = rules.find((r) => r.regime === 'SHOCK')!;
    expect(shock.matches({ realizedVol: 0, atr: 0, closeSlope: 0, trendStrength: 0, returnDispersion: 0.06, volumeAbnormality: 3.5 })).toBe(true);
    expect(shock.matches({ realizedVol: 0, atr: 0, closeSlope: 0, trendStrength: 0, returnDispersion: 0.02, volumeAbnormality: 3.5 })).toBe(false);

    const up = rules.find((r) => r.regime === 'TREND_UP')!;
    expect(up.matches({ realizedVol: 0, atr: 0, closeSlope: 0.5, trendStrength: 25, returnDispersion: 0, volumeAbnormality: 0 })).toBe(true);
    expect(up.matches({ realizedVol: 0, atr: 0, closeSlope: -0.5, trendStrength: 25, returnDispersion: 0, volumeAbnormality: 0 })).toBe(false);
    expect(up.matches({ realizedVol: 0, atr: 0, closeSlope: 0.5, trendStrength: 20, returnDispersion: 0, volumeAbnormality: 0 })).toBe(false);

    const down = rules.find((r) => r.regime === 'TREND_DOWN')!;
    expect(down.matches({ realizedVol: 0, atr: 0, closeSlope: -0.5, trendStrength: 26, returnDispersion: 0, volumeAbnormality: 0 })).toBe(true);
    expect(down.matches({ realizedVol: 0, atr: 0, closeSlope: 0.5, trendStrength: 26, returnDispersion: 0, volumeAbnormality: 0 })).toBe(false);
    expect(down.matches({ realizedVol: 0, atr: 0, closeSlope: -0.5, trendStrength: 20, returnDispersion: 0, volumeAbnormality: 0 })).toBe(false);
  });

  it('matches HIGH_VOLATILITY, LOW_VOLATILITY, and RANGE rules exhaustively', () => {
    const rules = defaultRules();
    const highVol = rules.find((r) => r.regime === 'HIGH_VOLATILITY')!;
    expect(highVol.matches({ realizedVol: 1.2, atr: 0, closeSlope: 0, trendStrength: 0, returnDispersion: 0, volumeAbnormality: 0 })).toBe(true);
    expect(highVol.matches({ realizedVol: 0.8, atr: 0, closeSlope: 0, trendStrength: 0, returnDispersion: 0, volumeAbnormality: 0 })).toBe(false);

    const lowVol = rules.find((r) => r.regime === 'LOW_VOLATILITY')!;
    expect(lowVol.matches({ realizedVol: 0.3, atr: 0, closeSlope: 0, trendStrength: 15, returnDispersion: 0.005, volumeAbnormality: 0 })).toBe(true);
    expect(lowVol.matches({ realizedVol: 0.5, atr: 0, closeSlope: 0, trendStrength: 15, returnDispersion: 0.005, volumeAbnormality: 0 })).toBe(false);
    expect(lowVol.matches({ realizedVol: 0.3, atr: 0, closeSlope: 0, trendStrength: 25, returnDispersion: 0.005, volumeAbnormality: 0 })).toBe(false);
    expect(lowVol.matches({ realizedVol: 0.3, atr: 0, closeSlope: 0, trendStrength: 15, returnDispersion: 0.02, volumeAbnormality: 0 })).toBe(false);

    const range = rules.find((r) => r.regime === 'RANGE')!;
    expect(range.matches({ realizedVol: 0.6, atr: 0, closeSlope: 0, trendStrength: 12, returnDispersion: 0.02, volumeAbnormality: 0 })).toBe(true);
    expect(range.matches({ realizedVol: 0.6, atr: 0, closeSlope: 0, trendStrength: 25, returnDispersion: 0.02, volumeAbnormality: 0 })).toBe(false);
    expect(range.matches({ realizedVol: 0.6, atr: 0, closeSlope: 0, trendStrength: 12, returnDispersion: 0.04, volumeAbnormality: 0 })).toBe(false);
    expect(range.matches({ realizedVol: null, atr: null, closeSlope: null, trendStrength: null, returnDispersion: null, volumeAbnormality: null })).toBe(true);
  });

  it('handles null feature values across default rules', () => {
    const rules = defaultRules();
    const nullFeat = {
      realizedVol: null,
      atr: null,
      closeSlope: null,
      trendStrength: null,
      returnDispersion: null,
      volumeAbnormality: null,
    };
    expect(rules.find((r) => r.regime === 'SHOCK')!.matches(nullFeat)).toBe(false);
    expect(rules.find((r) => r.regime === 'TREND_UP')!.matches(nullFeat)).toBe(false);
    expect(rules.find((r) => r.regime === 'TREND_DOWN')!.matches(nullFeat)).toBe(false);
    expect(rules.find((r) => r.regime === 'HIGH_VOLATILITY')!.matches(nullFeat)).toBe(false);
    expect(rules.find((r) => r.regime === 'LOW_VOLATILITY')!.matches(nullFeat)).toBe(false);

    // Partial null cases for right-hand expressions in rules
    expect(rules.find((r) => r.regime === 'SHOCK')!.matches({ ...nullFeat, volumeAbnormality: 4 })).toBe(false);
    expect(rules.find((r) => r.regime === 'TREND_UP')!.matches({ ...nullFeat, closeSlope: 1 })).toBe(false);
    expect(rules.find((r) => r.regime === 'TREND_DOWN')!.matches({ ...nullFeat, closeSlope: -1 })).toBe(false);
    expect(rules.find((r) => r.regime === 'LOW_VOLATILITY')!.matches({ ...nullFeat, realizedVol: 0.1, trendStrength: 10 })).toBe(false);
    expect(rules.find((r) => r.regime === 'LOW_VOLATILITY')!.matches({ ...nullFeat, realizedVol: 0.1, returnDispersion: 0.005 })).toBe(true);
  });

  it('handles allNull features in pickRegime and fallback explanations', () => {
    const emptyFeatures = {
      realizedVol: null,
      atr: null,
      closeSlope: null,
      trendStrength: null,
      returnDispersion: null,
      volumeAbnormality: null,
    };
    expect(pickRegime(emptyFeatures, defaultRules())).toBe('UNKNOWN');

    const emptyRules: RegimeRule[] = [];
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
