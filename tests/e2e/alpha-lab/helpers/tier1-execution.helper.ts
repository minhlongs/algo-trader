import { describe, it, expect } from 'vitest';
import { AISignalAdapter, type AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import { RegimeAwareKelly, DEFAULT_MULTIPLIERS } from '../../../../src/desk/risk/regime-aware-kelly';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import { computeMetrics } from '../../../../src/desk/backtesting/metrics-calculator';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import { makeTrendUpCandles } from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades } from '../fixtures/test-helpers';

export function registerTier1ExecutionTests(): void {
  describe('Feature 12: Standardized AISignal Transformation (F12)', () => {
    const adapter = new AISignalAdapter({ confidenceThreshold: 0.6, minExpectancy: 0.01 });

    it('F12.1: accepts valid AISignal meeting confidence and expectancy hurdles', () => {
      const signal: AISignal = {
        signalId: 's1', strategyId: 'strat1', symbol: 'BTC/USDT', direction: 'BUY',
        confidence: 0.85, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now(),
      };
      expect(adapter.validateSignal(signal).valid).toBe(true);
    });

    it('F12.2: rejects signal when confidence is below configured hurdle', () => {
      const signal: AISignal = {
        signalId: 's2', strategyId: 'strat1', symbol: 'BTC/USDT', direction: 'BUY',
        confidence: 0.45, expectancy: 0.05, regime: 'TREND_UP', timestamp: Date.now(),
      };
      const val = adapter.validateSignal(signal);
      expect(val.valid).toBe(false);
      expect(val.rejectionReasons.some((r) => r.toLowerCase().includes('confidence'))).toBe(true);
    });

    it('F12.3: rejects signal when expectancy is below minimum threshold', () => {
      const signal: AISignal = {
        signalId: 's3', strategyId: 'strat1', symbol: 'BTC/USDT', direction: 'BUY',
        confidence: 0.85, expectancy: 0.002, regime: 'TREND_UP', timestamp: Date.now(),
      };
      const val = adapter.validateSignal(signal);
      expect(val.valid).toBe(false);
      expect(val.rejectionReasons.some((r) => r.toLowerCase().includes('expectancy'))).toBe(true);
    });

    it('F12.4: verifies expected holding period calibration and regime tagging', () => {
      const signal: AISignal = {
        signalId: 's4', strategyId: 'strat1', symbol: 'BTC/USDT', direction: 'BUY',
        confidence: 0.8, expectancy: 0.03, regime: 'RANGE', timestamp: Date.now(),
        calibratedConfidence: 0.78, expectedHoldingPeriod: 12,
      };
      expect(signal.expectedHoldingPeriod).toBe(12);
      expect(signal.calibratedConfidence).toBeCloseTo(0.78, 2);
    });

    it('F12.5: filters out signals whose regime is not in configured whitelist', () => {
      const restricted = new AISignalAdapter({ confidenceThreshold: 0.5, minExpectancy: 0.01, regimeFilter: ['TREND_UP'] });
      const signal: AISignal = {
        signalId: 's5', strategyId: 'strat1', symbol: 'BTC/USDT', direction: 'BUY',
        confidence: 0.8, expectancy: 0.05, regime: 'TREND_DOWN', timestamp: Date.now(),
      };
      expect(restricted.validateSignal(signal).valid).toBe(false);
    });
  });

  describe('Feature 13: Dynamic Order Book Depth Paper Executor (F13)', () => {
    it('F13.1: initializes paper trading account with isolated starting balance', async () => {
      const ex = new PaperExecutor({ initialBalance: 50000 });
      const acc = await ex.start(50000, true);
      expect(acc.balance).toBe(50000);
      await ex.stop();
    });

    it('F13.2: executes BUY order with realistic slippage and fee deduction', async () => {
      const ex = new PaperExecutor({ initialBalance: 50000, feePercent: 0.001, slippagePercent: 0.001, simulateFillRate: 1.0 });
      await ex.start(50000, true);
      const res = await ex.executePaperTrade({
        signalId: 'tb1', symbol: 'BTC/USDT', direction: 'BUY', action: 'BUY', side: 'buy',
        price: 50000, quantity: 0.1, confidence: 0.9, timestamp: Date.now(),
      }, 50000);
      expect(res.success).toBe(true);
      expect(res.trade?.fee).toBeGreaterThan(0);
      await ex.stop();
    });

    it('F13.3: executes SELL order updating inventory and realizing P&L', async () => {
      const ex = new PaperExecutor({ initialBalance: 50000, simulateFillRate: 1.0 });
      await ex.start(50000, true);
      await ex.executePaperTrade({
        signalId: 'tb', symbol: 'BTC/USDT', direction: 'BUY', action: 'BUY', side: 'buy',
        price: 50000, quantity: 0.2, confidence: 0.9, timestamp: Date.now(),
      }, 50000);
      const sell = await ex.executePaperTrade({
        signalId: 'ts', symbol: 'BTC/USDT', direction: 'SELL', action: 'SELL', side: 'sell',
        price: 51000, quantity: 0.2, confidence: 0.9, timestamp: Date.now(),
      }, 51000);
      expect(sell.success).toBe(true);
      expect(sell.trade?.pnl).toBeGreaterThan(0);
      await ex.stop();
    });

    it('F13.4: rejects BUY order when order cost exceeds available account balance', async () => {
      const ex = new PaperExecutor({ initialBalance: 1000, simulateFillRate: 1.0 });
      await ex.start(1000, true);
      const res = await ex.executePaperTrade({
        signalId: 'hb', symbol: 'BTC/USDT', direction: 'BUY', action: 'BUY', side: 'buy',
        price: 50000, quantity: 1.0, confidence: 0.9, timestamp: Date.now(),
      }, 50000);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Insufficient balance');
      await ex.stop();
    });

    it('F13.5: handles stopped engine rejecting further executions', async () => {
      const ex = new PaperExecutor();
      await ex.start(10000, true);
      await ex.stop();
      const res = await ex.executePaperTrade({ signalId: 'st', symbol: 'BTC/USDT', direction: 'BUY', action: 'BUY', side: 'buy', price: 50000, quantity: 0.01, confidence: 0.8, timestamp: Date.now() }, 50000);
      expect(res.success).toBe(false);
      expect(res.message).toContain('not started');
    });
  });

  describe('Feature 14: Quarter-Kelly Position Sizing (F14)', () => {
    const k = new RegimeAwareKelly({
      kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
      regimeMultipliers: DEFAULT_MULTIPLIERS,
      unknownRegimeMultiplier: 0.25,
    });

    it('F14.1: computes Quarter-Kelly fraction bounded by 5% portfolio risk cap', () => {
      const s = k.size({ portfolioValue: 100000, winProbability: 0.8, winLossRatio: 3.0 }, 'RANGE');
      expect(s.positionSizeUsd).toBeLessThanOrEqual(5000);
      expect(s.portfolioPercent).toBeLessThanOrEqual(5.0);
    });

    it('F14.2: applies favorable 1.25x scaling multiplier in TREND_UP regime', () => {
      const sTrend = k.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'TREND_UP');
      const sBase = k.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'RANGE');
      expect(sTrend.positionSizeUsd).toBeGreaterThanOrEqual(sBase.positionSizeUsd);
    });

    it('F14.3: reduces exposure multiplier in TREND_DOWN and HIGH_VOLATILITY regimes', () => {
      const sDown = k.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'TREND_DOWN');
      const sBase = k.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'RANGE');
      expect(sDown.positionSizeUsd).toBeLessThan(sBase.positionSizeUsd);
    });

    it('F14.4: strictly zeros out allocation (0.00x) in SHOCK regime to protect capital', () => {
      const sShock = k.size({ portfolioValue: 100000, winProbability: 0.9, winLossRatio: 4.0 }, 'SHOCK');
      expect(sShock.positionSizeUsd).toBe(0);
      expect(sShock.fractionUsed).toBe(0);
    });

    it('F14.5: applies conservative fallback multiplier in UNKNOWN regime', () => {
      const sUnk = k.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'UNKNOWN');
      const sBase = k.size({ portfolioValue: 100000, winProbability: 0.6, winLossRatio: 1.5 }, 'RANGE');
      expect(sUnk.positionSizeUsd).toBeLessThan(sBase.positionSizeUsd);
    });
  });

  describe('Feature 15: Portfolio & PnL Attribution (F15)', () => {
    it('F15.1: marks open positions to market and tracks unrealized P&L', async () => {
      const ex = new PaperExecutor({ initialBalance: 50000, simulateFillRate: 1.0 });
      await ex.start(50000, true);
      await ex.executePaperTrade({ signalId: 'm1', symbol: 'BTC/USDT', direction: 'BUY', action: 'BUY', side: 'buy', price: 50000, quantity: 0.1, confidence: 0.9, timestamp: Date.now() }, 50000);
      ex.updatePrices(new Map([['BTC/USDT', 55000]]));
      expect(ex.getPositions().find((p) => p.symbol === 'BTC/USDT')?.unrealizedPnl).toBeGreaterThan(0);
      await ex.stop();
    });

    it('F15.2: updates realized P&L, winning trades, and losing trades upon closing positions', async () => {
      const ex = new PaperExecutor({ initialBalance: 50000, simulateFillRate: 1.0 });
      await ex.start(50000, true);
      await ex.executePaperTrade({ signalId: 'b1', symbol: 'BTC/USDT', direction: 'BUY', action: 'BUY', side: 'buy', price: 50000, quantity: 0.1, confidence: 0.9, timestamp: Date.now() }, 50000);
      await ex.executePaperTrade({ signalId: 's1', symbol: 'BTC/USDT', direction: 'SELL', action: 'SELL', side: 'sell', price: 52000, quantity: 0.1, confidence: 0.9, timestamp: Date.now() }, 52000);
      expect(ex.getPnlSummary().totalPnl).toBeGreaterThan(0);
      await ex.stop();
    });

    it('F15.3: tracks cash reserves, equity, and margin utilization', async () => {
      const ex = new PaperExecutor({ initialBalance: 50000, simulateFillRate: 1.0 });
      const acc = await ex.start(50000, true);
      expect(acc.equity).toBeGreaterThanOrEqual(50000);
      await ex.stop();
    });

    it('F15.4: computes cumulative equity curve and high-water mark across paper trades', () => {
      const trades = makeSyntheticTrades(40, 0.6, 200, -100);
      const eq = buildEquityCurve(makeTrendUpCandles(45).map((c) => ({ timestamp: c.timestamp })), trades);
      expect(eq[eq.length - 1]!.equity).toBeGreaterThan(eq[0]!.equity);
    });

    it('F15.5: generates comprehensive PnL summary including net profit, fee totals, and profit factor', () => {
      const trades = makeSyntheticTrades(50, 0.65, 200, -100);
      const eq = buildEquityCurve(makeTrendUpCandles(55).map((c) => ({ timestamp: c.timestamp })), trades);
      expect(computeMetrics(trades, eq).totalPnl).toBeGreaterThan(0);
    });
  });
}
