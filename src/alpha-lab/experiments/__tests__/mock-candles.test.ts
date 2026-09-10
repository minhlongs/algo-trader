import { describe, it, expect } from 'vitest';
import { generateMockCandles } from '../mock-candles';

describe('generateMockCandles', () => {
  it('generates candles with basePrice 60000 for BTC symbols', () => {
    const candles = generateMockCandles('BTC/USDT', 5, 42);
    expect(candles).toHaveLength(5);
    expect(candles[0]!.open).toBe(60000);
  });

  it('generates candles with basePrice 3500 for ETH symbols', () => {
    const candles = generateMockCandles('ETH-PERP', 5, 42);
    expect(candles).toHaveLength(5);
    expect(candles[0]!.open).toBe(3500);
  });

  it('generates candles with basePrice 150 for other symbols', () => {
    const candles = generateMockCandles('SOL/USDT', 5, 42);
    expect(candles).toHaveLength(5);
    expect(candles[0]!.open).toBe(150);
  });

  it('is deterministic when seed is provided', () => {
    const run1 = generateMockCandles('BTC/USDT', 10, 999);
    const run2 = generateMockCandles('BTC/USDT', 10, 999);
    expect(run1).toEqual(run2);
  });

  it('uses default seed 12345 when seed is omitted', () => {
    const runDefault = generateMockCandles('BTC/USDT', 10);
    const runSeeded = generateMockCandles('BTC/USDT', 10, 12345);
    expect(runDefault).toEqual(runSeeded);
  });

  it('produces valid OHLCV candles with valid timestamps and volume', () => {
    const candles = generateMockCandles('SOL', 10, 100);
    for (const c of candles) {
      expect(c.open).toBeGreaterThan(0);
      expect(c.high).toBeGreaterThanOrEqual(Math.min(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.max(c.open, c.close));
      expect(c.close).toBeGreaterThan(0);
      expect(c.volume).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(c.timestamp))).toBe(false);
    }
  });
});
