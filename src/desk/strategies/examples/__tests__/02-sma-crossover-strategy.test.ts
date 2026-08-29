import { describe, it, expect } from 'vitest';
import { SmaCrossoverStrategy } from '../02-sma-crossover-strategy';
import type { ICandle } from '../../../interfaces/IStrategy';

function candle(timestamp: number, close: number, volume = 1000): ICandle {
  return { timestamp, open: close, high: close, low: close, close, volume };
}

// Flat market followed by a strong trend — drives a golden/death cross that
// passes the confidence threshold.
function trendCandles(): ICandle[] {
  const candles: ICandle[] = [];
  for (let i = 0; i < 35; i++) candles.push(candle(1_000_000 + i, 100));
  for (let i = 0; i < 10; i++) candles.push(candle(2_000_000 + i, 100 + 5 * (i + 1)));
  return candles;
}

function downtrendCandles(): ICandle[] {
  const candles: ICandle[] = [];
  for (let i = 0; i < 35; i++) candles.push(candle(1_000_000 + i, 100));
  for (let i = 0; i < 10; i++) candles.push(candle(2_000_000 + i, 100 - 5 * (i + 1)));
  return candles;
}

describe('examples::02-sma-crossover-strategy', () => {
  it('returns a wait signal when there is not enough data', async () => {
    const strat = new SmaCrossoverStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res.action).toBe('wait');
    expect(res.confidence).toBe(0);
    expect(res.reason).toContain('Insufficient data');
  });

  it('reports strategy name', () => {
    const strat = new SmaCrossoverStrategy();
    expect(strat.getName()).toBe('SmaCrossover');
  });

  it('initializes successfully', async () => {
    const strat = new SmaCrossoverStrategy({ fastPeriod: 10, slowPeriod: 30, confidenceThreshold: 0.7 });
    await expect(strat.initialize()).resolves.toBeUndefined();
  });

  it('uses configured constructor options', () => {
    const strat = new SmaCrossoverStrategy({ fastPeriod: 5, slowPeriod: 20, confidenceThreshold: 0.5 });
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.fastPeriod).toBe(5);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.slowPeriod).toBe(20);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.confidenceThreshold).toBe(0.5);
  });

  it('uses sensible defaults when no options are provided', () => {
    const strat = new SmaCrossoverStrategy();
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.fastPeriod).toBe(10);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.slowPeriod).toBe(30);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.confidenceThreshold).toBe(0.7);
  });

  it('produces a buy signal after a flat market followed by an uptrend', async () => {
    const strat = new SmaCrossoverStrategy();
    const candles = trendCandles();
    // Feed one candle at a time to mimic a live execution loop
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (let i = 0; i < candles.length; i++) {
      res = await strat.execute([candles[i]!]);
      if (res.action !== 'wait') break;
    }
    expect(res!.action).toBe('buy');
    expect(res!.reason).toContain('SMA bullish crossover');
    expect(res!.confidence).toBeGreaterThan(0);
    expect(res!.metadata).toHaveProperty('fastSma');
    expect(res!.metadata).toHaveProperty('slowSma');
  });

  it('produces a sell signal after a flat market followed by a downtrend', async () => {
    const strat = new SmaCrossoverStrategy();
    const candles = downtrendCandles();
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (let i = 0; i < candles.length; i++) {
      res = await strat.execute([candles[i]!]);
      if (res.action !== 'wait') break;
    }
    expect(res!.action).toBe('sell');
    expect(res!.reason).toContain('SMA bearish crossover');
    expect(res!.confidence).toBeGreaterThan(0);
  });

  it('returns a wait signal when no crossover occurs', async () => {
    const strat = new SmaCrossoverStrategy();
    // Steady single-direction prices never cross over
    const candles: ICandle[] = [];
    for (let i = 0; i < 80; i++) candles.push(candle(1_000_000 + i, 100 + 0.5 * i));
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (const c of candles) res = await strat.execute([c]);
    expect(res!.action).toBe('wait');
    expect(res!.reason).toContain('No SMA crossover detected');
  });

  it('returns a wait signal when the crossover confidence is below the threshold', async () => {
    // A mild uptrend produces a crossover at ~0.73 confidence — below a 0.95
    // threshold the strategy must return wait instead of trading.
    const strat = new SmaCrossoverStrategy({ confidenceThreshold: 0.95 });
    const candles: ICandle[] = [];
    for (let i = 0; i < 35; i++) candles.push(candle(1_000_000 + i, 100));
    for (let i = 0; i < 20; i++) candles.push(candle(2_000_000 + i, 100 + 0.5 * (i + 1)));
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (let i = 0; i < candles.length; i++) {
      res = await strat.execute([candles[i]!]);
      if (res.action !== 'wait') break;
    }
    expect(res!.action).toBe('wait');
  });

  it('truncates price history to the last 200 candles', async () => {
    const strat = new SmaCrossoverStrategy();
    const candles: ICandle[] = [];
    for (let i = 0; i < 250; i++) candles.push(candle(i, 100 + (i % 10)));
    await strat.execute(candles);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(200);
  });

  it('appends new candles to the existing price history', async () => {
    const strat = new SmaCrossoverStrategy();
    await strat.execute([candle(1, 100), candle(2, 101), candle(3, 102)]);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(3);
    await strat.execute([candle(4, 103)]);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(4);
  });

  it('reports a status snapshot after a run', async () => {
    const strat = new SmaCrossoverStrategy();
    await strat.execute(trendCandles());
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.name).toBe('SmaCrossover');
    expect(st.candles).toBeGreaterThan(0);
    expect(typeof st.fastSma).toBe('number');
    expect(typeof st.slowSma).toBe('number');
    expect(typeof st.lastSignal).toBe('string');
  });

  it('reports lastSignal as none before any signal fires', async () => {
    const strat = new SmaCrossoverStrategy();
    await strat.execute([candle(1, 100), candle(2, 101)]);
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.lastSignal).toBe('none');
  });

  it('reports the last signal action after a run', async () => {
    const strat = new SmaCrossoverStrategy();
    const candles = trendCandles();
    for (let i = 0; i < candles.length; i++) {
      await strat.execute([candles[i]!]);
    }
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.lastSignal).toBe('buy');
  });

  it('handles a single candle without throwing', async () => {
    const strat = new SmaCrossoverStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res).toHaveProperty('action');
    expect(res).toHaveProperty('reason');
  });
});