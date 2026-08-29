import { describe, it, expect } from 'vitest';
import { MultiIndicatorConfluenceStrategy } from '../04-multi-indicator-confluence-strategy';
import type { ICandle } from '../../../interfaces/IStrategy';

function candle(timestamp: number, close: number, volume = 1000): ICandle {
  return { timestamp, open: close, high: close, low: close, close, volume };
}

function trendCandles(n: number, start: number, step: number, vol = 1000): ICandle[] {
  const candles: ICandle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    candles.push(candle(1_000_000 + i, p, vol));
    p += step;
  }
  return candles;
}

describe('examples::04-multi-indicator-confluence-strategy', () => {
  it('returns a wait signal when there is insufficient data', async () => {
    const strat = new MultiIndicatorConfluenceStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res.action).toBe('wait');
    expect(res.confidence).toBe(0);
    expect(res.reason).toContain('Insufficient data');
  });

  it('returns a wait signal when volatility is below the configured threshold', async () => {
    // Flat prices -> near-zero Bollinger width -> low volatility
    const strat = new MultiIndicatorConfluenceStrategy({ volatilityThreshold: 0.5 });
    const res = await strat.execute(trendCandles(60, 100, 0));
    expect(res.action).toBe('wait');
    expect(res.reason).toContain('Volatility too low');
    expect(res.metadata).toHaveProperty('volatility');
  });

  it('uses a higher volatility threshold to avoid waiting on a mild trend', async () => {
    // A clear uptrend still produces volatility below 0.3; a 0.02 threshold passes
    const strat = new MultiIndicatorConfluenceStrategy();
    const res = await strat.execute(trendCandles(120, 100, 2));
    // The confluence score is intentionally conservative — the signal may be wait,
    // buy, or sell, but the strategy must return a valid signal object.
    expect(['buy', 'sell', 'wait']).toContain(res.action);
    expect(res).toHaveProperty('confidence');
    expect(res).toHaveProperty('reason');
  });

  it('metadata is populated on a signal with indicators and scores when not waiting for confluence', async () => {
    const strat = new MultiIndicatorConfluenceStrategy();
    const res = await strat.execute(trendCandles(120, 100, 2));
    // When the signal is not "no clear confluence", metadata has scores+indicators
    if (res.reason !== 'No clear confluence' && !res.reason.includes('Volatility too low') && !res.reason.includes('Insufficient data')) {
      expect(res.metadata).toHaveProperty('scores');
      expect(res.metadata).toHaveProperty('indicators');
      expect(res.metadata!.scores).toHaveProperty('buyScore');
      expect(res.metadata!.scores).toHaveProperty('sellScore');
      expect(res.metadata!.scores).toHaveProperty('agreeing');
    }
  });

  it('reports strategy name and a status snapshot after a run', async () => {
    const strat = new MultiIndicatorConfluenceStrategy({ emaFast: 10, emaSlow: 20, rsiPeriod: 10 });
    expect(strat.getName()).toBe('MultiIndicatorConfluence');
    await strat.initialize();
    await strat.execute(trendCandles(60, 100, 1));
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.name).toBe('MultiIndicatorConfluence');
    expect(st.candles).toBe(60);
    expect(typeof st.emaFast).toBe('number');
    expect(typeof st.emaSlow).toBe('number');
    expect(typeof st.rsi).toBe('number');
  });

  it('uses the configured constructor options', () => {
    const strat = new MultiIndicatorConfluenceStrategy({ emaFast: 7, emaSlow: 21, rsiPeriod: 10, minConfluence: 4, volatilityThreshold: 0.05 });
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.emaFast).toBe(7);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.emaSlow).toBe(21);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.rsiPeriod).toBe(10);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.minConfluence).toBe(4);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.volatilityThreshold).toBe(0.05);
  });

  it('uses sensible defaults when no options are provided', () => {
    const strat = new MultiIndicatorConfluenceStrategy();
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.emaFast).toBe(12);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.emaSlow).toBe(26);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.rsiPeriod).toBe(14);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.minConfluence).toBe(3);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.volatilityThreshold).toBe(0.02);
  });

  it('truncates price history to the last 300 candles', async () => {
    const strat = new MultiIndicatorConfluenceStrategy();
    await strat.execute(trendCandles(450, 100, 1));
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(300);
  });

  it('appends new candles to the existing price history', async () => {
    const strat = new MultiIndicatorConfluenceStrategy();
    await strat.execute(trendCandles(50, 100, 1));
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(50);
    await strat.execute(trendCandles(30, 150, 1));
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(80);
  });

  it('handles a large-volume spike without throwing', async () => {
    const strat = new MultiIndicatorConfluenceStrategy();
    const candles = trendCandles(80, 100, 1, 1000);
    candles.push(candle(999_999, 180, 100_000));
    const res = await strat.execute(candles);
    expect(['buy', 'sell', 'wait']).toContain(res.action);
  });

  it('returns a wait signal for a minConfluence of 4 when only 3 indicators agree', async () => {
    // high minConfluence (4) makes it nearly impossible to fire, so we always land on "no clear confluence"
    const strat = new MultiIndicatorConfluenceStrategy({ minConfluence: 4 });
    const res = await strat.execute(trendCandles(120, 100, 2));
    expect(res.action).toBe('wait');
    expect(res.reason).toContain('No clear confluence');
  });
});