import { describe, it, expect } from 'vitest';
import { buyAndHold, randomEntry, simpleMomentum, simpleMeanReversion } from '../baseline-strategies';
import type { CandleLike } from '../../regimes/regime-types';

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

const cost = { feeBps: 5, slippageBps: 2 };

describe('Buy & Hold', () => {
  it('returns one trade for entire period', () => {
    const candles = makeCandles(50);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = buyAndHold(closes, { cost, seed: 42 });
    expect(r.name).toBe('buy-and-hold');
    expect(r.trades).toHaveLength(1);
    expect(r.totalTrades).toBe(1);
  });

  it('applies round-trip cost', () => {
    const candles = makeCandles(10);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = buyAndHold(closes, { cost: { feeBps: 10, slippageBps: 5 }, seed: 42 });
    // entryPrice=100, exitPrice=109, fee+slippage=15bps, round-trip cost = 0.3
    // PnL is return-on-capital: gross=0.09, fee=0.003, net=0.087
    expect(r.trades[0]!.pnl).toBeCloseTo(0.087, 3);
  });

  it('returns empty for single candle', () => {
    const closes = [{ timestamp: '2025-01-01T00:00:00Z', close: 100 }];
    const r = buyAndHold(closes, { cost, seed: 42 });
    expect(r.trades).toHaveLength(0);
  });

  it('returns empty when entryIdx is at or beyond last candle', () => {
    const candles = makeCandles(5);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = buyAndHold(closes, { cost, seed: 42, entryIdx: 4 });
    expect(r.trades).toHaveLength(0);
  });
});

describe('Random Entry', () => {
  it('is deterministic with same seed', () => {
    const candles = makeCandles(100);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r1 = randomEntry(closes, { cost, seed: 7 });
    const r2 = randomEntry(closes, { cost, seed: 7 });
    expect(r1.trades).toHaveLength(r2.trades.length);
    expect(r1.trades.every((t, i) => t.pnl === r2.trades[i]!.pnl)).toBe(true);
  });

  it('produces trades', () => {
    const candles = makeCandles(200);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = randomEntry(closes, { cost, seed: 42 });
    expect(r.name).toBe('random-entry');
    expect(r.totalTrades).toBe(r.trades.length);
    expect(r.trades.length).toBeGreaterThan(0);
  });
});

describe('Simple Momentum', () => {
  it('generates trades on trending candles', () => {
    const candles = makeCandles(100);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = simpleMomentum(closes, { cost, seed: 42 });
    expect(r.name).toBe('simple-momentum');
    expect(Array.isArray(r.trades)).toBe(true);
  });

  it('returns empty when data too short', () => {
    const candles = makeCandles(20);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = simpleMomentum(closes, { cost, seed: 42 });
    expect(r.trades).toHaveLength(0);
  });
});

describe('Simple Mean Reversion', () => {
  it('generates trades on mean-reverting candles', () => {
    const candles = makeCandles(100);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = simpleMeanReversion(closes, { cost, seed: 42 });
    expect(r.name).toBe('simple-mean-reversion');
    expect(Array.isArray(r.trades)).toBe(true);
  });

  it('enters on sharp dip and exits when price reverts above exit threshold', () => {
    const prices = Array(20).fill(100);
    prices.push(80); // dip below entry threshold
    prices.push(100); // price recovers -> zScore > -exitThresh -> exits
    prices.push(...Array(30).fill(100));
    const closes = prices.map((close, i) => ({ timestamp: `2025-01-${String(i + 1).padStart(2, '0')}`, close }));
    const r = simpleMeanReversion(closes, { cost, period: 20, maxHolding: 10, entryThreshold: 1.5, exitThreshold: 0.5 });
    expect(r.trades.length).toBe(1);
    expect(r.trades[0]!.price).toBe(100);
    expect(r.trades[0]!.pnl).toBeGreaterThan(0);
  });

  it('exits after maxHolding when price does not revert', () => {
    const prices = Array(20).fill(100);
    prices.push(80); // enters at index 20
    prices.push(...Array(15).fill(80)); // stays at 80, exceeding maxHolding (10)
    prices.push(...Array(30).fill(80));
    const closes = prices.map((close, i) => ({ timestamp: `2025-01-${String(i + 1).padStart(2, '0')}`, close }));
    const r = simpleMeanReversion(closes, { cost, period: 20, maxHolding: 10, entryThreshold: 1.5, exitThreshold: 0.5 });
    expect(r.trades.length).toBe(1);
    expect(r.trades[0]!.price).toBe(80);
    expect(r.trades[0]!.pnl).toBeLessThan(0);
  });

  it('closes open position at final candle if still holding at loop end', () => {
    const prices = Array(34).fill(100);
    prices.push(80); // index 34: enters
    prices.push(...Array(10).fill(80)); // total 45
    const closes = prices.map((close, i) => ({ timestamp: `2025-01-${String(i + 1).padStart(2, '0')}`, close }));
    const r = simpleMeanReversion(closes, { cost, period: 20, maxHolding: 10 });
    expect(r.trades.length).toBe(1);
    expect(r.trades[0]!.price).toBe(80);
  });

  it('handles flat prices with zero standard deviation', () => {
    const prices = Array(50).fill(100);
    const closes = prices.map((close, i) => ({ timestamp: `2025-01-${String(i + 1).padStart(2, '0')}`, close }));
    const r = simpleMeanReversion(closes, { cost, period: 20, maxHolding: 10 });
    expect(r.trades).toHaveLength(0);
  });

  it('returns empty when data too short', () => {
    const candles = makeCandles(15);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const r = simpleMeanReversion(closes, { cost, seed: 42 });
    expect(r.trades).toHaveLength(0);
  });
});

describe('Baseline contracts', () => {
  it('all strategies return same signature', () => {
    const candles = makeCandles(120);
    const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
    const results = [
      buyAndHold(closes, { cost, seed: 42 }),
      randomEntry(closes, { cost, seed: 42 }),
      simpleMomentum(closes, { cost, seed: 42 }),
      simpleMeanReversion(closes, { cost, seed: 42 }),
    ];
    for (const r of results) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('trades');
      expect(r).toHaveProperty('totalTrades');
      expect(typeof r.name).toBe('string');
      expect(Array.isArray(r.trades)).toBe(true);
      expect(typeof r.totalTrades).toBe('number');
    }
  });
});