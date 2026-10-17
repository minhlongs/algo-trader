import { describe, it, expect } from 'vitest';
import { RiskManagedKellyStrategy } from '../05-risk-managed-kelly-strategy';
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

interface InternalStrategyFields {
  maxPositionPercent: number; kellyFraction: number; dailyLossLimitUsd: number;
  maxDrawdownPercent: number; trailingStopPercent: number;
  riskMetrics: { dailyPnL: number }; priceHistory: unknown[];
}

describe('examples::05-risk-managed-kelly-strategy', () => {
  it('returns a wait signal when there is not enough data', async () => {
    const strat = new RiskManagedKellyStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res.action).toBe('wait');
    expect(res.confidence).toBe(0);
    expect(res.reason).toContain('No signal');
  });

  it('reports strategy name', () => {
    const strat = new RiskManagedKellyStrategy();
    expect(strat.getName()).toBe('RiskManagedKelly');
  });

  it('initializes successfully', async () => {
    const strat = new RiskManagedKellyStrategy({ maxPositionPercent: 0.02, kellyFraction: 0.25 });
    await expect(strat.initialize()).resolves.toBeUndefined();
  });

  it('uses configured constructor options', () => {
    const strat = new RiskManagedKellyStrategy({
      maxPositionPercent: 0.05, kellyFraction: 0.5, dailyLossLimitUsd: 1000,
      maxDrawdownPercent: 0.1, trailingStopPercent: 0.03,
    }) as unknown as InternalStrategyFields;
    expect(strat.maxPositionPercent).toBe(0.05);
    expect(strat.kellyFraction).toBe(0.5);
    expect(strat.dailyLossLimitUsd).toBe(1000);
    expect(strat.maxDrawdownPercent).toBe(0.1);
    expect(strat.trailingStopPercent).toBe(0.03);
  });

  it('uses sensible defaults when no options are provided', () => {
    const strat = new RiskManagedKellyStrategy() as unknown as InternalStrategyFields;
    expect(strat.maxPositionPercent).toBe(0.02);
    expect(strat.kellyFraction).toBe(0.25);
    expect(strat.dailyLossLimitUsd).toBe(500);
    expect(strat.maxDrawdownPercent).toBe(0.10);
    expect(strat.trailingStopPercent).toBe(0.02);
  });

  it('produces a buy signal after a flat market followed by an uptrend', async () => {
    const strat = new RiskManagedKellyStrategy();
    let res: Awaited<ReturnType<typeof strat.execute>> | undefined;
    for (const c of trendCandles()) { res = await strat.execute([c]); if (res.action !== 'wait') break; }
    expect(res!.action).toBe('buy');
    expect(res!.reason).toContain('SMA bullish crossover');
    expect(res!.confidence).toBeGreaterThan(0);
    expect(res!.metadata).toHaveProperty('size');
    expect(res!.metadata).toHaveProperty('kellyFraction');
  });

  it('produces a sell signal after a flat market followed by a downtrend', async () => {
    const strat = new RiskManagedKellyStrategy();
    let res: Awaited<ReturnType<typeof strat.execute>> | undefined;
    for (const c of downtrendCandles()) { res = await strat.execute([c]); if (res.action !== 'wait') break; }
    expect(res!.action).toBe('sell');
    expect(res!.reason).toContain('SMA bearish crossover');
    expect(res!.confidence).toBeGreaterThan(0);
  });

  it('returns a wait signal when no crossover occurs', async () => {
    const strat = new RiskManagedKellyStrategy();
    const candles = Array.from({ length: 80 }, (_, i) => candle(1_000_000 + i, 100 + 0.5 * i));
    let res: Awaited<ReturnType<typeof strat.execute>> | undefined;
    for (const c of candles) res = await strat.execute([c]);
    expect(res!.action).toBe('wait');
    expect(res!.reason).toContain('No signal');
  });

  it('returns a wait signal when the risk limits block the trade', async () => {
    const strat = new RiskManagedKellyStrategy({ dailyLossLimitUsd: 100 });
    (strat as unknown as InternalStrategyFields).riskMetrics.dailyPnL = -500;
    let res: Awaited<ReturnType<typeof strat.execute>> | undefined;
    for (const c of trendCandles()) { res = await strat.execute([c]); if (res.action !== 'wait') break; }
    expect(res!.action).toBe('wait');
    expect(res!.reason).toContain('Risk limit');
  });

  it('truncates price history to the last 200 candles', async () => {
    const strat = new RiskManagedKellyStrategy();
    const candles = Array.from({ length: 250 }, (_, i) => candle(i, 100 + (i % 10)));
    await strat.execute(candles);
    expect((strat as unknown as InternalStrategyFields).priceHistory.length).toBe(200);
  });

  it('appends new candles to the existing price history', async () => {
    const strat = new RiskManagedKellyStrategy();
    await strat.execute([candle(1, 100), candle(2, 101), candle(3, 102)]);
    expect((strat as unknown as InternalStrategyFields).priceHistory.length).toBe(3);
    await strat.execute([candle(4, 103)]);
    expect((strat as unknown as InternalStrategyFields).priceHistory.length).toBe(4);
  });

  it('reports a status snapshot after a run', async () => {
    const strat = new RiskManagedKellyStrategy();
    await strat.execute(trendCandles());
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.name).toBe('RiskManagedKelly');
    expect(st.candles).toBeGreaterThan(0);
    expect(typeof st.sma10).toBe('number');
    expect(typeof st.sma30).toBe('number');
    expect(typeof st.balance).toBe('number');
    expect(typeof st.dailyPnL).toBe('number');
  });

  it('reports no open position before any signal fires', async () => {
    const strat = new RiskManagedKellyStrategy();
    await strat.execute([candle(1, 100), candle(2, 101)]);
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.openPosition).toBeNull();
    expect(st.balance).toBe(10000);
  });

  it('reports an open position after a buy signal fires', async () => {
    const strat = new RiskManagedKellyStrategy();
    for (const c of trendCandles()) await strat.execute([c]);
    const st = strat.getStatus() as Record<string, unknown>;
    expect(st.openPosition).not.toBeNull();
    expect((st.openPosition as { size: number }).size).toBeGreaterThan(0);
  });

  it('handles a single candle without throwing', async () => {
    const strat = new RiskManagedKellyStrategy();
    const res = await strat.execute([candle(1, 100)]);
    expect(res).toHaveProperty('action');
    expect(res).toHaveProperty('reason');
  });
});