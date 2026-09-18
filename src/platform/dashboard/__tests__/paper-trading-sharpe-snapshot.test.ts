import { describe, it, expect } from 'vitest';
import { computeSharpeRatio, computePnlSnapshot, type DailyPnl } from '../paper-trading-pnl-tracker';
import { makeTrade, makePortfolio } from './paper-trading-pnl-helpers';

describe('Paper Trading: computeSharpeRatio', () => {
  it('should return 0 for fewer than 2 days', () => {
    expect(computeSharpeRatio([])).toBe(0);
    expect(computeSharpeRatio([{ date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 }])).toBe(0);
  });

  it('should return 0 when all returns are identical (stddev=0)', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 10, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeSharpeRatio(days)).toBe(0);
  });

  it('should compute positive Sharpe for positive returns', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: 10, trades: 1, wins: 1, losses: 0 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
    ];
    expect(computeSharpeRatio(days)).toBeGreaterThan(0);
  });

  it('should compute negative Sharpe for negative returns', () => {
    const days: DailyPnl[] = [
      { date: '2026-04-01', pnl: -10, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-02', pnl: -20, trades: 1, wins: 0, losses: 1 },
    ];
    expect(computeSharpeRatio(days)).toBeLessThan(0);
  });

  it('should annualize using sqrt(252)', () => {
    const diffDays: DailyPnl[] = [
      { date: '2026-04-01', pnl: 0, trades: 1, wins: 0, losses: 1 },
      { date: '2026-04-02', pnl: 20, trades: 1, wins: 1, losses: 0 },
    ];
    const expected = (10 / Math.sqrt(200)) * Math.sqrt(252);
    expect(computeSharpeRatio(diffDays)).toBeCloseTo(expected, 4);
  });
});

describe('Paper Trading: computePnlSnapshot', () => {
  it('should produce a complete snapshot from a portfolio', () => {
    const day1 = new Date('2026-04-10T10:00:00Z').getTime();
    const day2 = new Date('2026-04-11T10:00:00Z').getTime();
    const closedTrades = [
      makeTrade({ timestamp: day1, pnl: 20, size: 100 }),
      makeTrade({ timestamp: day2, pnl: -10, size: 100 }),
    ];
    const portfolio = makePortfolio({
      capital: 900,
      totalPnl: 10,
      winCount: 1,
      lossCount: 1,
      closedTrades,
    });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.totalPnl).toBe(10);
    expect(snapshot.realizedPnl).toBe(10);
    expect(snapshot.unrealizedPnl).toBe(0);
    expect(snapshot.openPositions).toBe(0);
    expect(snapshot.closedTrades).toBe(2);
    expect(snapshot.winRate).toBeCloseTo(0.5, 5);
    expect(snapshot.capitalRemaining).toBe(900);
    expect(snapshot.timestamp).toBeGreaterThan(0);
  });

  it('should compute avgEdge as mean of (pnl / size) across closed trades', () => {
    const trades = [
      makeTrade({ pnl: 10, size: 100 }),
      makeTrade({ pnl: 5, size: 50 }),
      makeTrade({ pnl: -5, size: 100 }),
    ];
    const portfolio = makePortfolio({ totalPnl: 10, winCount: 2, lossCount: 1, closedTrades: trades });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.avgEdge).toBeCloseTo(0.05, 5);
  });

  it('should return avgEdge=0 when no closed trades', () => {
    const portfolio = makePortfolio({ closedTrades: [], winCount: 0, lossCount: 0 });
    expect(computePnlSnapshot(portfolio).avgEdge).toBe(0);
  });

  it('should compute winRate=0 when no trades', () => {
    const portfolio = makePortfolio({ winCount: 0, lossCount: 0, closedTrades: [] });
    expect(computePnlSnapshot(portfolio).winRate).toBe(0);
  });

  it('should compute winRate=1 when all wins', () => {
    const trades = [makeTrade({ pnl: 10 }), makeTrade({ pnl: 5 })];
    const portfolio = makePortfolio({ winCount: 2, lossCount: 0, closedTrades: trades });
    expect(computePnlSnapshot(portfolio).winRate).toBe(1);
  });

  it('should count open positions from portfolio', () => {
    const positions = [makeTrade({ id: 'open-1' }), makeTrade({ id: 'open-2' })];
    const portfolio = makePortfolio({ positions });
    expect(computePnlSnapshot(portfolio).openPositions).toBe(2);
  });

  it('should compute maxDrawdown and sharpeRatio from closed trades', () => {
    const day1 = new Date('2026-04-01T10:00:00Z').getTime();
    const day2 = new Date('2026-04-02T10:00:00Z').getTime();
    const day3 = new Date('2026-04-03T10:00:00Z').getTime();
    const trades = [
      makeTrade({ timestamp: day1, pnl: 50 }),
      makeTrade({ timestamp: day2, pnl: -30 }),
      makeTrade({ timestamp: day3, pnl: 20 }),
    ];
    const portfolio = makePortfolio({ totalPnl: 40, winCount: 2, lossCount: 1, closedTrades: trades });
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.maxDrawdown).toBeCloseTo(0.6, 5);
    expect(snapshot.sharpeRatio).not.toBe(0);
  });

  it('should handle zero-size trades safely in avgEdge', () => {
    const trades = [makeTrade({ pnl: 10, size: 0 }), makeTrade({ pnl: 5, size: 100 })];
    const portfolio = makePortfolio({ totalPnl: 15, winCount: 2, lossCount: 0, closedTrades: trades });
    expect(() => computePnlSnapshot(portfolio)).not.toThrow();
    const snapshot = computePnlSnapshot(portfolio);
    expect(snapshot.avgEdge).toBeDefined();
    expect(isFinite(snapshot.avgEdge)).toBe(true);
  });
});
