import { describe, it, expect } from 'vitest';
import { generateMultiRegimeCandles, DEFAULT_REGIME_SCHEDULE } from '../multi-regime-candle-generator';
import { computeRegimeSeries, distinctRegimes } from '../../regimes/regime-series';

describe('Multi-Regime Candle Generator', () => {
  it('generates deterministic candles matching the schedule length', () => {
    const totalBars = DEFAULT_REGIME_SCHEDULE.reduce((s, seg) => s + seg.bars, 0);
    const candles = generateMultiRegimeCandles();
    expect(candles).toHaveLength(totalBars);

    // Deterministic check
    const candles2 = generateMultiRegimeCandles();
    expect(candles).toEqual(candles2);
  });

  it('exhibits all scheduled market regimes when classified causally', () => {
    const candles = generateMultiRegimeCandles();
    const series = computeRegimeSeries(candles, {
      market: 'BTC/USDT',
      timeframe: '1h',
      lookback: 20,
    });

    const regimes = distinctRegimes(series);

    // In a 20-bar lookback, bar 0 is UNKNOWN due to insufficient lookback (< 2 bars)
    expect(regimes).toContain('UNKNOWN');
    expect(regimes).toContain('TREND_UP');
    expect(regimes).toContain('RANGE');
    expect(regimes).toContain('HIGH_VOLATILITY');
    expect(regimes).toContain('SHOCK');
    expect(regimes).toContain('TREND_DOWN');
    expect(regimes).toContain('LOW_VOLATILITY');

    // Total distinct regimes should cover all 7
    expect(regimes.length).toBe(7);
  });

  it('supports custom segment configurations', () => {
    const customCandles = generateMultiRegimeCandles({
      basePrice: 50000,
      segments: [
        { regime: 'TREND_UP', bars: 25 },
        { regime: 'LOW_VOLATILITY', bars: 25 },
      ],
    });

    expect(customCandles).toHaveLength(50);
    expect(customCandles[0]!.open).toBe(50000);
  });
});
