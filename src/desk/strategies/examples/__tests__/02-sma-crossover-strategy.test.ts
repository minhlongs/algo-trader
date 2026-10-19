import { describe, it, expect } from 'vitest';
import { SmaCrossoverStrategy } from '../02-sma-crossover-strategy';
import type { ICandle } from '../../../interfaces/IStrategy';

function candle(timestamp: number, close: number, volume = 1000): ICandle {
  return { timestamp, open: close, high: close, low: close, close, volume };
}

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
  it('returns a wait signal when there is not enough data and handles a single candle', async () => {
    const strat = new SmaCrossoverStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res.action).toBe('wait');
    expect(res.confidence).toBe(0);
    expect(res.reason).toContain('Insufficient data');
  });

  it('reports strategy name and initializes successfully', async () => {
    const strat = new SmaCrossoverStrategy({ fastPeriod: 10, slowPeriod: 30, confidenceThreshold: 0.7 });
    expect(strat.getName()).toBe('SmaCrossover');
    await expect(strat.initialize()).resolves.toBeUndefined();
  });

  it('uses configured constructor options and sensible defaults', () => {
    const strat = new SmaCrossoverStrategy({ fastPeriod: 5, slowPeriod: 20, confidenceThreshold: 0.5 });
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.fastPeriod).toBe(5);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.slowPeriod).toBe(20);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.confidenceThreshold).toBe(0.5);

    const defStrat = new SmaCrossoverStrategy();
    // @ts-expect-error - reach into private fields for assertions
    expect(defStrat.fastPeriod).toBe(10);
    // @ts-expect-error - reach into private fields for assertions
    expect(defStrat.slowPeriod).toBe(30);
    // @ts-expect-error - reach into private fields for assertions
    expect(defStrat.confidenceThreshold).toBe(0.7);
  });

  it('produces a buy signal after a flat market followed by an uptrend', async () => {
    const strat = new SmaCrossoverStrategy();
    const candles = trendCandles();
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
    const candles: ICandle[] = [];
    for (let i = 0; i < 80; i++) candles.push(candle(1_000_000 + i, 100 + 0.5 * i));
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (const c of candles) res = await strat.execute([c]);
    expect(res!.action).toBe('wait');
    expect(res!.reason).toContain('No SMA crossover detected');
  });

  it('returns a wait signal when the crossover confidence is below the threshold', async () => {
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

  it('truncates price history to the last 200 candles and appends new candles', async () => {
    const strat = new SmaCrossoverStrategy();
    const candles: ICandle[] = [];
    for (let i = 0; i < 250; i++) candles.push(candle(i, 100 + (i % 10)));
    await strat.execute(candles);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(200);

    const strat2 = new SmaCrossoverStrategy();
    await strat2.execute([candle(1, 100), candle(2, 101), candle(3, 102)]);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat2.priceHistory.length).toBe(3);
    await strat2.execute([candle(4, 103)]);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat2.priceHistory.length).toBe(4);
  });

  it('reports status snapshots before and after signals fire', async () => {
    const strat = new SmaCrossoverStrategy();
    await strat.execute([candle(1, 100), candle(2, 101)]);
    expect((strat.getStatus() as Record<string, unknown>).lastSignal).toBe('none');

    const candles = trendCandles();
    for (let i = 0; i < candles.length; i++) await strat.execute([candles[i]!]);
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.name).toBe('SmaCrossover');
    expect(st.candles).toBeGreaterThan(0);
    expect(typeof st.fastSma).toBe('number');
    expect(typeof st.slowSma).toBe('number');
    expect(st.lastSignal).toBe('buy');
  });
});
