/**
 * BacktestRunner Tests
 */
import { describe, it, expect } from 'vitest';
import { BacktestRunner, BacktestTrade } from '../backtest-runner';

const sampleTrades: BacktestTrade[] = [
  { entryTimestamp: 1000, exitTimestamp: 2000, pnlUsd: 25, entryPrice: 0.5, exitPrice: 0.55, size: 100, side: 'buy', marketId: 'm1' },
  { entryTimestamp: 3000, exitTimestamp: 4000, pnlUsd: -10, entryPrice: 0.6, exitPrice: 0.58, size: 100, side: 'sell', marketId: 'm2' },
  { entryTimestamp: 5000, exitTimestamp: 6000, pnlUsd: 40, entryPrice: 0.4, exitPrice: 0.48, size: 100, side: 'buy', marketId: 'm3' },
  { entryTimestamp: 7000, exitTimestamp: 8000, pnlUsd: -5, entryPrice: 0.7, exitPrice: 0.68, size: 50, side: 'buy', marketId: 'm4' },
  { entryTimestamp: 9000, exitTimestamp: 10000, pnlUsd: 30, entryPrice: 0.3, exitPrice: 0.35, size: 150, side: 'buy', marketId: 'm5' },
];

describe('BacktestRunner', () => {
  describe('run', () => {
    it('returns empty result for no trades', () => {
      const result = BacktestRunner.run([]);
      expect(result.totalTrades).toBe(0);
      expect(result.totalPnlUsd).toBe(0);
      expect(result.sharpeRatio).toBe(0);
    });

    it('computes correct total P&L', () => {
      const result = BacktestRunner.run(sampleTrades);
      // 25 -10 +40 -5 +30 = 80
      expect(result.totalPnlUsd).toBe(80);
    });

    it('computes correct win rate', () => {
      const result = BacktestRunner.run(sampleTrades);
      // 3 wins out of 5 = 0.6
      expect(result.winRate).toBe(0.6);
      expect(result.winningTrades).toBe(3);
      expect(result.losingTrades).toBe(2);
    });

    it('computes profit factor', () => {
      const result = BacktestRunner.run(sampleTrades);
      // grossProfit = 25+40+30 = 95, grossLoss = 10+5 = 15
      // profitFactor = 95/15 ≈ 6.3333
      expect(result.profitFactor).toBeCloseTo(6.3333, 2);
    });

    it('computes Sharpe ratio', () => {
      const result = BacktestRunner.run(sampleTrades);
      // Should be non-zero with 5 trades
      expect(result.sharpeRatio).not.toBe(0);
      expect(Number.isFinite(result.sharpeRatio)).toBe(true);
    });

    it('computes max drawdown', () => {
      const result = BacktestRunner.run(sampleTrades);
      // Equity: 10000, 10025, 10015, 10055, 10050, 10080
      // maxDD = 0 (never below initial)
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.maxDrawdown).toBeLessThan(1);
    });

    it('handles all-winning trades', () => {
      const wins: BacktestTrade[] = [
        { entryTimestamp: 1000, exitTimestamp: 2000, pnlUsd: 50, entryPrice: 0.5, exitPrice: 0.55, size: 100, side: 'buy' },
        { entryTimestamp: 3000, exitTimestamp: 4000, pnlUsd: 30, entryPrice: 0.6, exitPrice: 0.63, size: 100, side: 'buy' },
      ];
      const result = BacktestRunner.run(wins);
      expect(result.winRate).toBe(1.0);
      expect(result.profitFactor).toBe(Infinity);
    });

    it('handles all-losing trades', () => {
      const losses: BacktestTrade[] = [
        { entryTimestamp: 1000, exitTimestamp: 2000, pnlUsd: -50, entryPrice: 0.5, exitPrice: 0.45, size: 100, side: 'buy' },
        { entryTimestamp: 3000, exitTimestamp: 4000, pnlUsd: -30, entryPrice: 0.6, exitPrice: 0.57, size: 100, side: 'buy' },
      ];
      const result = BacktestRunner.run(losses);
      expect(result.winRate).toBe(0);
      expect(result.profitFactor).toBe(0);
    });
  });

  describe('computeSharpe', () => {
    it('returns 0 for insufficient returns', () => {
      expect(BacktestRunner.computeSharpe([])).toBe(0);
      expect(BacktestRunner.computeSharpe([0.01])).toBe(0);
    });

    it('returns 0 for zero-variance returns', () => {
      expect(BacktestRunner.computeSharpe([0.02, 0.02, 0.02])).toBe(0);
    });

    it('computes positive Sharpe for positive returns', () => {
      const sharpe = BacktestRunner.computeSharpe([0.01, 0.02, 0.015, 0.01, 0.02]);
      expect(sharpe).toBeGreaterThan(0);
    });
  });

  describe('computeMaxDrawdown', () => {
    it('returns 0 for single-element curve', () => {
      expect(BacktestRunner.computeMaxDrawdown([10000])).toBe(0);
    });

    it('computes drawdown from peak', () => {
      // Peak 100, drops to 80 = 20% drawdown
      const dd = BacktestRunner.computeMaxDrawdown([100, 90, 80, 95, 110]);
      expect(dd).toBeCloseTo(0.2, 2);
    });

    it('returns 0 for monotonically increasing curve', () => {
      const dd = BacktestRunner.computeMaxDrawdown([100, 105, 110, 120]);
      expect(dd).toBe(0);
    });
  });
});
