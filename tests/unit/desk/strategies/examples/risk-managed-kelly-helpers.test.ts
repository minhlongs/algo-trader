/**
 * Tests for risk-managed-kelly-helpers — pure strategy math helpers.
 *
 * Covers: SMA/ATR/volatility, Kelly position sizing, risk checks, drawdown,
 * trailing stops (long/short), position close results, and win-stats updates.
 */

import { describe, it, expect } from 'vitest';
import type { ICandle } from '../../../../../src/desk/interfaces/IStrategy';
import {
  calculateSma,
  calculateAtr,
  calculateRecentVolatility,
  calculateKellyPosition,
  checkRiskLimits,
  calculateDrawdown,
  checkTrailingStop,
  closePositionResult,
  updateWinStats,
  type Position,
  type RiskMetrics,
} from '../../../../../src/desk/strategies/examples/risk-managed-kelly-helpers';

function makeCandles(count: number, baseClose = 100): ICandle[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: Date.now() + i * 60000,
    open: baseClose + i,
    high: baseClose + i + 2,
    low: baseClose + i - 2,
    close: baseClose + i,
    volume: 1000,
  }));
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    entryPrice: 100,
    size: 1,
    stopLoss: 95,
    takeProfit: 110,
    side: 'long',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<RiskMetrics> = {}): RiskMetrics {
  return {
    dailyPnL: 0,
    peakBalance: 10000,
    currentBalance: 10000,
    openPosition: null,
    ...overrides,
  };
}

describe('risk-managed-kelly-helpers', () => {
  describe('calculateSma', () => {
    it('returns the average of the last N values', () => {
      expect(calculateSma([10, 20, 30, 40, 50], 3)).toBe(40); // (30+40+50)/3
    });

    it('averages all data when period exceeds length (divides by period, not slice length)', () => {
      // calculateSma divides by `period`, so (10+20)/50 = 0.6
      expect(calculateSma([10, 20], 50)).toBe(0.6);
    });
  });

  describe('calculateAtr', () => {
    it('calculates a positive average true range', () => {
      const atr = calculateAtr(makeCandles(20, 100), 14);
      expect(atr).toBeGreaterThan(0);
    });

    it('returns NaN with a single candle (no TR values)', () => {
      expect(calculateAtr(makeCandles(1, 100), 14)).toBeNaN();
    });
  });

  describe('calculateRecentVolatility', () => {
    it('returns a non-negative coefficient of variation', () => {
      expect(calculateRecentVolatility(makeCandles(25, 100), 20)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateKellyPosition', () => {
    it('returns zero size when win rate is zero', () => {
      const result = calculateKellyPosition(100, 10000, 0, 1.5, 0.5, 0.5, makeCandles(30));
      expect(result.size).toBe(0);
    });

    it('returns zero size when win/loss ratio is zero', () => {
      const result = calculateKellyPosition(100, 10000, 0.6, 0, 0.5, 0.5, makeCandles(30));
      expect(result.size).toBe(0);
    });

    it('returns a positive size for a favorable edge', () => {
      const result = calculateKellyPosition(100, 10000, 0.6, 1.5, 0.5, 0.5, makeCandles(30));
      expect(result.size).toBeGreaterThan(0);
      expect(result.stopPercent).toBeLessThanOrEqual(0.05);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('confidence is reduced by volatility', () => {
      const steady = calculateKellyPosition(100, 10000, 0.8, 2, 0.5, 0.5, makeCandles(30));
      const jittery = makeCandles(30).map((c, i) =>
        i % 2 === 0 ? { ...c, close: c.close + 30 } : { ...c, close: c.close - 30 },
      );
      const volatile = calculateKellyPosition(100, 10000, 0.8, 2, 0.5, 0.5, jittery);
      expect(volatile.confidence).toBeLessThan(steady.confidence);
    });
  });

  describe('calculateDrawdown', () => {
    it('returns 0 when balances are equal', () => {
      expect(calculateDrawdown(10000, 10000)).toBe(0);
    });

    it('returns positive drawdown when balance dropped', () => {
      expect(calculateDrawdown(10000, 9000)).toBeCloseTo(0.1, 5);
    });

    it('returns negative when balance exceeded peak (gain)', () => {
      expect(calculateDrawdown(10000, 11000)).toBeCloseTo(-0.1, 5);
    });
  });

  describe('checkRiskLimits', () => {
    it('fails when daily loss exceeds limit', () => {
      const result = checkRiskLimits(makeMetrics({ dailyPnL: -600, currentBalance: 9400 }), 500, 0.3);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Daily loss limit');
    });

    it('passes when loss is within limit', () => {
      const result = checkRiskLimits(makeMetrics({ dailyPnL: -100, currentBalance: 9900 }), 500, 0.3);
      expect(result.pass).toBe(true);
    });

    it('fails when drawdown exceeds max', () => {
      const result = checkRiskLimits(makeMetrics({ dailyPnL: -100, currentBalance: 6000 }), 500, 0.3);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Max drawdown');
    });

    it('passes when dailyPnL is positive even if large', () => {
      const result = checkRiskLimits(makeMetrics({ dailyPnL: 1000, currentBalance: 11000 }), 500, 0.3);
      expect(result.pass).toBe(true);
    });
  });

  describe('checkTrailingStop', () => {
    it('triggers for long position when price falls to stop', () => {
      const result = checkTrailingStop(makePosition(), 95, 0.05);
      expect(result.triggered).toBe(true);
      expect(result.metadata!.stopPrice).toBe(95);
      expect(result.metadata!.pnl).toBe(-5);
    });

    it('does not trigger for long position when price above stop', () => {
      expect(checkTrailingStop(makePosition(), 105, 0.05).triggered).toBe(false);
    });

    it('triggers for short position when price rises to stop', () => {
      const short = makePosition({ side: 'short', stopLoss: 105, takeProfit: 90 });
      const result = checkTrailingStop(short, 105, 0.05);
      expect(result.triggered).toBe(true);
      expect(result.metadata!.pnl).toBe(-5);
    });

    it('does not trigger for short position when price below stop', () => {
      const short = makePosition({ side: 'short', stopLoss: 105, takeProfit: 90 });
      expect(checkTrailingStop(short, 95, 0.05).triggered).toBe(false);
    });

    it('uses trailing price (above stopLoss) for long when price is well above entry', () => {
      const moved = makePosition({ stopLoss: 90 });
      // trail = 100 * 0.95 = 95 > 90; price 100 > 95 → no trigger yet
      expect(checkTrailingStop(moved, 100, 0.05).triggered).toBe(false);
    });
  });

  describe('closePositionResult', () => {
    it('calculates long P&L on close', () => {
      const { pnl, updatedMetrics } = closePositionResult(makePosition(), 110, makeMetrics(), []);
      expect(pnl).toBe(10);
      expect(updatedMetrics.dailyPnL).toBe(10);
      expect(updatedMetrics.currentBalance).toBe(10010);
      expect(updatedMetrics.openPosition).toBeNull();
    });

    it('calculates short P&L on close', () => {
      const short = makePosition({ side: 'short' });
      expect(closePositionResult(short, 90, makeMetrics(), []).pnl).toBe(10);
    });

    it('updates peakBalance when balance exceeds previous peak', () => {
      const { updatedMetrics } = closePositionResult(makePosition(), 120, makeMetrics(), []);
      expect(updatedMetrics.peakBalance).toBe(10020);
    });

    it('keeps peakBalance when closing at a loss', () => {
      const { updatedMetrics } = closePositionResult(makePosition(), 90, makeMetrics(), []);
      expect(updatedMetrics.peakBalance).toBe(10000);
    });

    it('filters out trades older than 24h', () => {
      const oldTrade = { pnl: 5, timestamp: Date.now() - 25 * 60 * 60 * 1000 };
      const recentTrade = { pnl: 3, timestamp: Date.now() - 2 * 60 * 60 * 1000 };
      const { updatedTrades } = closePositionResult(
        makePosition(),
        110,
        makeMetrics(),
        [oldTrade, recentTrade],
      );
      expect(updatedTrades).toHaveLength(2); // new trade + recent one
      expect(updatedTrades.some((t) => t.pnl === 5)).toBe(false); // old dropped
    });
  });

  describe('updateWinStats', () => {
    it('returns defaults when fewer than 5 trades', () => {
      const stats = updateWinStats([{ pnl: 10, timestamp: 1 }, { pnl: -5, timestamp: 2 }]);
      expect(stats.winRate).toBe(0.6);
      expect(stats.winLossRatio).toBe(1.5);
    });

    it('calculates win rate from positive trades', () => {
      const trades = [10, -5, 10, -5, 10, -5].map((pnl, i) => ({ pnl, timestamp: i }));
      expect(updateWinStats(trades).winRate).toBeCloseTo(0.5, 2);
    });

    it('calculates win/loss ratio from average win vs average loss', () => {
      const trades = [100, -50, 100, -50, 100, -50].map((pnl, i) => ({ pnl, timestamp: i }));
      expect(updateWinStats(trades).winLossRatio).toBeCloseTo(2.0, 1);
    });

    it('uses fallback ratio when no losses exist', () => {
      const trades = [100, 100, 100, 100, 100, 100].map((pnl, i) => ({ pnl, timestamp: i }));
      expect(updateWinStats(trades).winLossRatio).toBe(1.5);
    });
  });
});
