import { describe, it, expect } from 'vitest';
import { computeDailyPnl, computeMaxDrawdown, type DailyPnl } from '../paper-trading-pnl-tracker';
import { makeTrade } from './paper-trading-pnl-helpers';

describe('Paper Trading: computeDailyPnl', () => {
  it('should return empty array for no trades', () => {
    expect(computeDailyPnl([])).toEqual([]);
  });

  it('should group a single trade into one day', () => {
    const ts = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [makeTrade({ timestamp: ts, pnl: 15 })];
    const result = computeDailyPnl(trades);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2026-04-10', pnl: 15, trades: 1, wins: 1, losses: 0 });
  });

  it('should aggregate multiple trades on the same day', () => {
    const ts = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: ts, pnl: 10 }),
      makeTrade({ timestamp: ts, pnl: 5 }),
      makeTrade({ timestamp: ts, pnl: -3 }),
    ];
    const result = computeDailyPnl(trades);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2026-04-10', pnl: 12, trades: 3, wins: 2, losses: 1 });
  });

  it('should separate trades across multiple days', () => {
    const day1 = new Date('2026-04-10T10:00:00Z').getTime();
    const day2 = new Date('2026-04-11T10:00:00Z').getTime();
    const trades = [makeTrade({ timestamp: day1, pnl: 10 }), makeTrade({ timestamp: day2, pnl: -5 })];
    const result = computeDailyPnl(trades);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-04-10');
    expect(result[0].pnl).toBe(10);
    expect(result[1].date).toBe('2026-04-11');
    expect(result[1].pnl).toBe(-5);
  });

  it('should sort results by date ascending', () => {
    const late = new Date('2026-04-15T10:00:00Z').getTime();
    const early = new Date('2026-04-05T10:00:00Z').getTime();
    const mid = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: late, pnl: 1 }),
      makeTrade({ timestamp: early, pnl: 2 }),
      makeTrade({ timestamp: mid, pnl: 3 }),
    ];
    const result = computeDailyPnl(trades);
    expect(result.map((d) => d.date)).toEqual(['2026-04-05', '2026-04-10', '2026-04-15']);
  });

  it('should classify zero-pnl trades as wins', () => {
    const ts = new Date('2026-04-10T10:00:00Z').getTime();
    const trades = [makeTrade({ timestamp: ts, pnl: 0 })];
    const result = computeDailyPnl(trades);
    expect(result[0].wins).toBe(1);
    expect(result[0].losses).toBe(0);
  });

  it('should handle trades spanning many days with mixed results', () => {
    const base = new Date('2026-04-01T10:00:00Z').getTime();
    const day = 86_400_000;
    const trades = [
      makeTrade({ timestamp: base, pnl: 20 }),
      makeTrade({ timestamp: base + day, pnl: -10 }),
      makeTrade({ timestamp: base + 2 * day, pnl: 5 }),
      makeTrade({ timestamp: base + 3 * day, pnl: -15 }),
      makeTrade({ timestamp: base + 4 * day, pnl: 30 }),
    ];
    const result = computeDailyPnl(trades);
    expect(result).toHaveLength(5);
    expect(result.map((d) => d.trades)).toEqual([1, 1, 1, 1, 1]);
    expect(result.map((d) => d.wins)).toEqual([1, 0, 1, 0, 1]);
    expect(result.map((d) => d.losses)).toEqual([0, 1, 0, 1, 0]);
  });
});

describe('Paper Trading: computeMaxDrawdown', () => {
  it('should return 0 for empty input', () => {
    expect(computeMaxDrawdown([])).toBe(0);
  });

  it('should return 0 when all daily P&Ls are profits (no drawdown)', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: 5, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBe(0);
  });

  it('should compute peak-to-trough drawdown as a fraction', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: -5, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-04', pnl: -10, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-05', pnl: 25, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBeCloseTo(0.5, 5);
  });

  it('should handle drawdown from peak of 0 (all losses)', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: -10, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-02', pnl: -5, trades: 1, wins: 0, losses: 1 },
    ];
    expect(computeMaxDrawdown(days)).toBe(0);
  });

  it('should recover from drawdown and still report the peak drawdown', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 50, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 30, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-03', pnl: -20, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-04', pnl: -20, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-05', pnl: 30, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-06', pnl: 20, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBeCloseTo(0.5, 5);
  });

  it('should handle single-day input', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeMaxDrawdown(days)).toBe(0);
  });
});
