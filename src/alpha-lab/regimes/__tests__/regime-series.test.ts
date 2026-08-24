import { describe, it, expect } from 'vitest';
import { computeRegimeSeries, distinctRegimes } from '../regime-series';
import type { CandleLike, RegimeRule } from '../regime-types';

function makeCandles(n: number): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
}

const opts = { market: 'X', timeframe: '1h', lookback: 5 };

describe('Regime series', () => {
  it('returns one regime per candle deterministically', () => {
    const candles = makeCandles(20);
    const first = computeRegimeSeries(candles, opts);
    const second = computeRegimeSeries(candles, opts);
    expect(first).toHaveLength(candles.length);
    expect(first).toEqual(second);
  });

  it('uses only candles up to the current bar', () => {
    const prefix = makeCandles(12);
    const withFuture = [...prefix, ...makeCandles(8).map((c, i) => ({ ...c, close: 500 + i }))];
    const prefixSeries = computeRegimeSeries(prefix, opts);
    const futureSeries = computeRegimeSeries(withFuture, opts).slice(0, prefix.length);
    expect(futureSeries).toEqual(prefixSeries);
  });

  it('returns an empty series for empty candles', () => {
    expect(computeRegimeSeries([], opts)).toEqual([]);
  });

  it('deduplicates regimes in deterministic sorted order', () => {
    expect(distinctRegimes(['TREND_UP', 'RANGE', 'TREND_UP', 'UNKNOWN'])).toEqual([
      'RANGE',
      'TREND_UP',
      'UNKNOWN',
    ]);
  });

  it('passes custom rules through to the classifier', () => {
    const rules: RegimeRule[] = [
      { regime: 'SHOCK', description: 'test override', matches: () => true },
    ];
    expect(computeRegimeSeries(makeCandles(3), { ...opts, rules })).toEqual(['UNKNOWN', 'SHOCK', 'SHOCK']);
  });

  it('limits each classification window to lookback plus current bar', () => {
    const rules: RegimeRule[] = [
      { regime: 'LOW_VOLATILITY', description: 'short window', matches: (f) => f.closeSlope !== null && f.closeSlope <= 2 },
      { regime: 'HIGH_VOLATILITY', description: 'long window', matches: () => true },
    ];
    const series = computeRegimeSeries(makeCandles(12), { ...opts, lookback: 2, rules });
    expect(series.slice(3)).toEqual(Array(9).fill('LOW_VOLATILITY'));
  });
});
