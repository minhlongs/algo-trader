import { describe, it, expect } from 'vitest';
import { BacktestEngine } from '../simulation-engine';
import { AlmgrenChrissModel } from '../slippage-model';
import type { Tick } from '../../../shared/types/market-data';

describe('BacktestEngine Comprehensive Simulation', () => {
  it('returns empty simulation result when tick array is empty', async () => {
    const engine = new BacktestEngine([], { dailyVolume: 10000 });
    const result = await engine.run(() => 1);

    expect(result.ticksProcessed).toBe(0);
    expect(result.pnl).toBe(0);
    expect(result.sharpe).toBe(0);
    expect(result.dsr).toBe(0);
    expect(result.tradesCount).toBe(0);
    expect(result.returns).toEqual([]);
  });

  it('sorts ticks chronologically and breaks ties deterministically by tick id', async () => {
    const ticks: Tick[] = [
      { id: 'b', price: 102, timestamp: 200, volume: 10 },
      { id: 'a', price: 101, timestamp: 200, volume: 10 },
      { id: 'c', price: 100, timestamp: 100, volume: 10 },
    ];

    const engine = new BacktestEngine(ticks, { dailyVolume: 10000 });
    const sorted = engine.getTicks();

    expect(sorted[0].id).toBe('c');
    expect(sorted[1].id).toBe('a');
    expect(sorted[2].id).toBe('b');
  });

  it('processes buy and sell signals accounting for Almgren-Chriss non-linear slippage', async () => {
    const ticks: Tick[] = [
      { id: 't1', price: 100, timestamp: 1000, volume: 10 },
      { id: 't2', price: 110, timestamp: 2000, volume: 10 },
      { id: 't3', price: 120, timestamp: 3000, volume: 10 },
    ];

    const slippageModel = new AlmgrenChrissModel({ permanentImpact: 0.1, temporaryImpact: 0.5 });
    const engine = new BacktestEngine(ticks, {
      dailyVolume: 1000,
      initialCapital: 10000,
      slippageModel,
      nBacktests: 5,
    });

    // Strategy buys 1 unit on tick 1, sells 1 unit on tick 3
    const result = await engine.run((tick) => {
      if (tick.id === 't1') return 1;
      if (tick.id === 't3') return -1;
      return 0;
    });

    expect(result.ticksProcessed).toBe(3);
    expect(result.tradesCount).toBe(2);
    expect(result.totalSlippagePaid).toBeGreaterThan(0);
    expect(Number.isFinite(result.pnl)).toBe(true);
    expect(Number.isFinite(result.sharpe)).toBe(true);
    expect(Number.isFinite(result.dsr)).toBe(true);
  });

  it('handles flat returns with zero variance without crashing Sharpe or DSR', async () => {
    const ticks: Tick[] = [
      { id: 't1', price: 100, timestamp: 1000, volume: 10 },
      { id: 't2', price: 100, timestamp: 2000, volume: 10 },
      { id: 't3', price: 100, timestamp: 3000, volume: 10 },
    ];

    const engine = new BacktestEngine(ticks, {
      dailyVolume: 5000,
      initialCapital: 10000,
    });

    const result = await engine.run(() => 0); // No trades, flat portfolio
    expect(result.sharpe).toBe(0);
    expect(result.dsr).toBe(0);
    expect(result.pnl).toBe(0);
  });

  it('calculates positive Sharpe and DSR for consistently profitable trend strategy', async () => {
    const ticks: Tick[] = Array.from({ length: 20 }, (_, i) => ({
      id: `tick-${i}`,
      price: 100 + i * 2,
      timestamp: 1000 + i * 1000,
      volume: 50,
    }));

    const engine = new BacktestEngine(ticks, {
      dailyVolume: 100000,
      initialCapital: 10000,
      nBacktests: 10,
    });

    // Buy 1 share at the beginning and hold
    const result = await engine.run((tick) => (tick.id === 'tick-0' ? 1 : 0));

    expect(result.pnl).toBeGreaterThan(0);
    expect(result.sharpe).toBeGreaterThan(0);
    expect(result.dsr).toBeGreaterThan(0);
    expect(result.tradesCount).toBe(1);
  });
});
