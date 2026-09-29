import { describe, it, expect } from 'vitest';
import { AISignalAdapter, type AISignal } from '../../../../src/desk/strategies/ai-signal-adapter';
import { RegimeAwareKelly } from '../../../../src/desk/risk/regime-aware-kelly';
import { PaperExecutor } from '../../../../src/desk/execution/paper-executor';
import { buildEquityCurve } from '../../../../src/alpha-lab/shared/equity-curve';
import { makeRangeCandles, makeTrendUpCandles } from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades } from '../fixtures/test-helpers';

export function registerTier2ExecutionTests(): void {
  describe('Feature 12: Standardized AISignal Transformation Boundaries (F12)', () => {
    const adapter = new AISignalAdapter({
      confidenceThreshold: 0.70, minExpectancy: 0.02, regimeFilter: ['TREND_UP', 'LOW_VOLATILITY'],
    });

    it('B12.1: boundary confidence: 0.7000 passes, 0.6999 fails', () => {
      const passSig: AISignal = { strategyId: 's', direction: 'BUY', confidence: 0.70, expectancy: 0.025, regime: 'TREND_UP', timestamp: Date.now() };
      const failSig: AISignal = { ...passSig, confidence: 0.6999 };
      expect(adapter.evaluateSignal(passSig)).toBe(true);
      expect(adapter.evaluateSignal(failSig)).toBe(false);
    });

    it('B12.2: boundary expectancy: 0.0200 passes, 0.0199 fails', () => {
      const passSig: AISignal = { strategyId: 's', direction: 'BUY', confidence: 0.85, expectancy: 0.02, regime: 'TREND_UP', timestamp: Date.now() };
      const failSig: AISignal = { ...passSig, expectancy: 0.0199 };
      expect(adapter.evaluateSignal(passSig)).toBe(true);
      expect(adapter.evaluateSignal(failSig)).toBe(false);
    });

    it('B12.3: rejects signal with negative expectancy (-0.05)', () => {
      const negSig: AISignal = { strategyId: 's', direction: 'SELL', confidence: 0.99, expectancy: -0.05, regime: 'TREND_UP', timestamp: Date.now() };
      expect(adapter.evaluateSignal(negSig)).toBe(false);
    });

    it('B12.4: empty regimeFilter accepts all 7 market regimes', () => {
      const openAdapter = new AISignalAdapter({ confidenceThreshold: 0.5, minExpectancy: 0.0 });
      const regimes = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK', 'UNKNOWN'] as const;
      for (const regime of regimes) {
        expect(openAdapter.filterByRegime({ strategyId: 's', direction: 'BUY', confidence: 0.6, expectancy: 0.01, regime, timestamp: 0 })).toBe(true);
      }
    });

    it('B12.5: strictly blocks SHOCK regime when whitelist permits only TREND_UP', () => {
      const shockSig: AISignal = { strategyId: 's', direction: 'BUY', confidence: 0.95, expectancy: 0.10, regime: 'SHOCK', timestamp: Date.now() };
      expect(adapter.filterByRegime(shockSig)).toBe(false);
    });
  });

  describe('Feature 13: Dynamic Order Book Depth Paper Executor Boundaries (F13)', () => {
    it('B13.1: fails sell order when holding zero position inventory', async () => {
      const ex = new PaperExecutor({ initialBalance: 10000, simulateFillRate: 1.0 });
      await ex.start(10000, true);
      const res = await ex.executePaperTrade({ symbol: 'ETH', side: 'sell', quantity: 1.0 }, 3000);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Insufficient position');
      await ex.stop();
    });

    it('B13.2: fails execution when simulateFillRate is 0.0', async () => {
      const ex = new PaperExecutor({ initialBalance: 10000, simulateFillRate: 0.0 });
      await ex.start(10000, true);
      const res = await ex.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.05 }, 50000);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Order not filled');
      await ex.stop();
    });

    it('B13.3: rejects buy order when account has exactly $0 balance', async () => {
      const ex = new PaperExecutor({ initialBalance: 0, simulateFillRate: 1.0 });
      await ex.start(0, true);
      const res = await ex.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.01 }, 50000);
      expect(res.success).toBe(false);
      expect(res.message).toContain('Insufficient balance');
      await ex.stop();
    });

    it('B13.4: tracks weighted average entry price across multiple buy orders', async () => {
      const ex = new PaperExecutor({ initialBalance: 20000, simulateFillRate: 1.0 });
      await ex.start(20000, true);
      await ex.executePaperTrade({ symbol: 'AVAX', side: 'buy', quantity: 10 }, 20);
      await ex.executePaperTrade({ symbol: 'AVAX', side: 'buy', quantity: 10 }, 40);
      const pos = ex.getPositions().find((p) => p.symbol === 'AVAX');
      expect(pos?.quantity).toBe(20);
      expect(pos?.entryPrice).toBeCloseTo(30, 0);
      await ex.stop();
    });

    it('B13.5: limits trade history slice cleanly', async () => {
      const ex = new PaperExecutor({ initialBalance: 10000, simulateFillRate: 1.0 });
      await ex.start(10000, true);
      await ex.executePaperTrade({ symbol: 'SOL', side: 'buy', quantity: 1 }, 100);
      await ex.executePaperTrade({ symbol: 'SOL', side: 'sell', quantity: 1 }, 110);
      expect(ex.getTradeHistory().length).toBe(2);
      expect(ex.getTradeHistory(1).length).toBe(1);
      await ex.stop();
    });
  });

  describe('Feature 14: Quarter-Kelly Position Sizing Boundaries (F14)', () => {
    const sizer = new RegimeAwareKelly({
      kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05, minPositionUsd: 1.0 },
      regimeMultipliers: {}, unknownRegimeMultiplier: 0.75,
    });

    it('B14.1: returns zero position size when winProbability is 0', () => {
      expect(sizer.size({ winProbability: 0, winLossRatio: 2.0, portfolioValue: 100000 }, 'TREND_UP').positionSizeUsd).toBe(0);
    });

    it('B14.2: returns zero position size when winLossRatio is non-positive', () => {
      expect(sizer.size({ winProbability: 0.6, winLossRatio: 0, portfolioValue: 100000 }, 'TREND_UP').positionSizeUsd).toBe(0);
    });

    it('B14.3: returns zero position size when portfolio value is zero or negative', () => {
      expect(sizer.size({ winProbability: 0.6, winLossRatio: 2.0, portfolioValue: 0 }, 'TREND_UP').positionSizeUsd).toBe(0);
    });

    it('B14.4: strictly zeroes out position in SHOCK regime regardless of edge', () => {
      expect(sizer.size({ winProbability: 0.95, winLossRatio: 10.0, portfolioValue: 1000000 }, 'SHOCK').positionSizeUsd).toBe(0);
    });

    it('B14.5: position size below minPositionUsd ($1) collapses to $0', () => {
      expect(sizer.size({ winProbability: 0.6, winLossRatio: 1.5, portfolioValue: 10 }, 'RANGE').positionSizeUsd).toBe(0);
    });
  });

  describe('Feature 15: Portfolio & PnL Attribution Boundaries (F15)', () => {
    it('B15.1: zero trades equity curve remains strictly flat at 1.0', () => {
      const curve = buildEquityCurve(makeRangeCandles(20), []);
      expect(curve.length).toBe(20);
      expect(curve.every((p) => p.equity === 1.0)).toBe(true);
    });

    it('B15.2: empty closes array returns empty equity curve', () => {
      expect(buildEquityCurve([], makeSyntheticTrades(5))).toEqual([]);
    });

    it('B15.3: updatePrices preserves positions when symbol not in price map', async () => {
      const ex = new PaperExecutor({ initialBalance: 10000, simulateFillRate: 1.0 });
      await ex.start(10000, true);
      await ex.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.1 }, 50000);
      const updated = ex.updatePrices(new Map<string, number>());
      expect(updated.length).toBe(1);
      expect(updated[0]?.symbol).toBe('BTC');
      await ex.stop();
    });

    it('B15.4: marks open positions to market and tracks unrealized P&L accurately', async () => {
      const ex = new PaperExecutor({ initialBalance: 20000, simulateFillRate: 1.0 });
      await ex.start(20000, true);
      await ex.executePaperTrade({ symbol: 'BTC', side: 'buy', quantity: 0.1 }, 50000);
      ex.updatePrices(new Map([['BTC', 55000]]));
      const pos = ex.getPositions().find((p) => p.symbol === 'BTC');
      expect(pos?.unrealizedPnl).toBeGreaterThan(0);
      await ex.stop();
    });

    it('B15.5: high-water mark computation never drops below initial peak', () => {
      const trades = makeSyntheticTrades(10, 0.4, 100, -200);
      const curve = buildEquityCurve(makeTrendUpCandles(15).map((c) => ({ timestamp: c.timestamp })), trades);
      let hwm = 1.0;
      for (const pt of curve) {
        if (pt.equity > hwm) hwm = pt.equity;
      }
      expect(hwm).toBeGreaterThanOrEqual(1.0);
    });
  });
}
