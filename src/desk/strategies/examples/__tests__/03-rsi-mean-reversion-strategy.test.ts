import { describe, it, expect } from 'vitest';
import { RsiMeanReversionStrategy } from '../03-rsi-mean-reversion-strategy';
import type { ICandle } from '../../../interfaces/IStrategy';

function candle(timestamp: number, close: number, volume = 1000): ICandle {
  return { timestamp, open: close, high: close, low: close, close, volume };
}

// Mildly wiggling prices followed by a strong dip then a recovery — drives RSI
// below the oversold threshold and then back above it, which the strategy
// treats as a buy signal.
function dipThenRecoverCandles(): ICandle[] {
  const candles: ICandle[] = [];
  let p = 100;
  for (let i = 0; i < 40; i++) {
    candles.push(candle(1_000_000 + i, p));
    p += (i % 3) - 1;
  }
  for (let i = 0; i < 16; i++) {
    candles.push(candle(2_000_000 + i, p));
    p -= 4;
  }
  for (let i = 0; i < 8; i++) {
    candles.push(candle(3_000_000 + i, p));
    p += 5;
  }
  return candles;
}

describe('examples::03-rsi-mean-reversion-strategy', () => {
  it('returns a wait signal when there is not enough data', async () => {
    const strat = new RsiMeanReversionStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res.action).toBe('wait');
    expect(res.confidence).toBe(0);
    expect(res.reason).toContain('Insufficient data');
  });

  it('reports strategy name', () => {
    const strat = new RsiMeanReversionStrategy();
    expect(strat.getName()).toBe('RsiMeanReversion');
  });

  it('initializes successfully', async () => {
    const strat = new RsiMeanReversionStrategy({ rsiPeriod: 14, oversoldThreshold: 30, overboughtThreshold: 70 });
    await expect(strat.initialize()).resolves.toBeUndefined();
  });

  it('uses configured constructor options', () => {
    const strat = new RsiMeanReversionStrategy({ rsiPeriod: 7, oversoldThreshold: 20, overboughtThreshold: 80, lookback: 5 });
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.rsiPeriod).toBe(7);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.oversold).toBe(20);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.overbought).toBe(80);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.lookback).toBe(5);
  });

  it('uses sensible defaults when no options are provided', () => {
    const strat = new RsiMeanReversionStrategy();
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.rsiPeriod).toBe(14);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.oversold).toBe(30);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.overbought).toBe(70);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.lookback).toBe(3);
  });

  it('returns a wait signal while the RSI history is still building', async () => {
    const strat = new RsiMeanReversionStrategy({ lookback: 5 });
    const candles = dipThenRecoverCandles();
    // Feed candles one at a time until lookback is reached
    const res = await strat.execute(candles.slice(0, 16));
    expect(res.action).toBe('wait');
    expect(res.reason).toContain('Building RSI history');
  });

  it('produces a buy signal after an oversold dip followed by a recovery', async () => {
    const strat = new RsiMeanReversionStrategy();
    const candles = dipThenRecoverCandles();
    // Feed the candles one bar at a time to mimic a live execution loop
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (let i = 0; i < candles.length; i++) {
      res = await strat.execute([candles[i]!]);
      if (res.action !== 'wait') break;
    }
    expect(res!.action).toBe('buy');
    expect(res!.reason).toContain('RSI oversold recovery');
    expect(res!.confidence).toBeGreaterThan(0);
    expect(res!.metadata).toHaveProperty('rsi');
    expect(res!.metadata).toHaveProperty('oversoldThreshold');
  });

  it('returns a wait signal when the RSI history is flat and never crosses a threshold', async () => {
    const strat = new RsiMeanReversionStrategy();
    // Steady single-direction prices never produce an oversold/overbought flip
    const candles: ICandle[] = [];
    let p = 100;
    for (let i = 0; i < 80; i++) {
      candles.push(candle(1_000_000 + i, p));
      p += 0.5;
    }
    // Feed one candle at a time so the RSI history grows past lookback
    let res: ReturnType<typeof strat.execute> extends Promise<infer U> ? U : never;
    for (const c of candles) {
      res = await strat.execute([c]);
    }
    expect(res!.action).toBe('wait');
    expect(res!.reason).toContain('No RSI signal');
  });

  it('truncates price history to the last 300 candles', async () => {
    const strat = new RsiMeanReversionStrategy();
    const candles: ICandle[] = [];
    for (let i = 0; i < 450; i++) candles.push(candle(i, 100 + (i % 10)));
    await strat.execute(candles);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(300);
  });

  it('truncates RSI history to the last 200 values', async () => {
    const strat = new RsiMeanReversionStrategy();
    const candles: ICandle[] = [];
    for (let i = 0; i < 450; i++) candles.push(candle(i, 100 + (i % 10)));
    await strat.execute(candles);
    await strat.execute(candles.slice(0, 50));
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.rsiValues.length).toBeLessThanOrEqual(200);
  });

  it('appends new candles to the existing price history', async () => {
    const strat = new RsiMeanReversionStrategy();
    await strat.execute([candle(1, 100), candle(2, 101), candle(3, 102)]);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(3);
    await strat.execute([candle(4, 103)]);
    // @ts-expect-error - reach into private fields for assertions
    expect(strat.priceHistory.length).toBe(4);
  });

  it('reports a status snapshot after a run', async () => {
    const strat = new RsiMeanReversionStrategy({ oversoldThreshold: 25, overboughtThreshold: 75 });
    await strat.execute(dipThenRecoverCandles());
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.name).toBe('RsiMeanReversion');
    expect(st.candles).toBeGreaterThan(0);
    expect(st.oversoldThreshold).toBe(25);
    expect(st.overboughtThreshold).toBe(75);
  });

  it('handles a single candle without throwing', async () => {
    const strat = new RsiMeanReversionStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res).toHaveProperty('action');
    expect(res).toHaveProperty('reason');
  });
});