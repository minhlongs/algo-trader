import { describe, it, expect } from 'vitest';
import { sizeSignalToTradeSignal } from '../regime-aware-kelly';
import { TieredDrawdownBreaker } from '../tiered-drawdown-breaker';
import type { AISignal } from '../../strategies/ai-signal-adapter';

describe('RegimeAwareKelly Payoff, Drawdown Breaker & Precision Test Suite', () => {
  const createSignal = (overrides: Partial<AISignal> = {}): AISignal => ({
    strategyId: 'strat-momentum-01',
    direction: 'BUY',
    confidence: 0.70,
    expectancy: 0.04,
    regime: 'RANGE',
    timestamp: 1700000000000,
    symbol: 'BTC/USDT',
    ...overrides,
  });

  describe('sizeSignalToTradeSignal — Payoff Ratio Derivation', () => {
    it('correctly derives b = (expectancy + 1 - confidence) / confidence', () => {
      const signal = createSignal({ confidence: 0.80, expectancy: 0.04, regime: 'RANGE' });
      const result = sizeSignalToTradeSignal(signal, { portfolioEquity: 100_000, currentPrice: 10_000 });
      expect(result.quantity).toBeCloseTo(0.33333333, 6);
    });

    it('returns zero quantity when expectancy is zero or negative', () => {
      const zeroExpSignal = createSignal({ confidence: 0.80, expectancy: 0 });
      const negExpSignal = createSignal({ confidence: 0.80, expectancy: -0.02 });
      expect(sizeSignalToTradeSignal(zeroExpSignal, { portfolioEquity: 10000, currentPrice: 100 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(negExpSignal, { portfolioEquity: 10000, currentPrice: 100 }).quantity).toBe(0);
    });
  });

  describe('sizeSignalToTradeSignal — Drawdown Breaker Protection', () => {
    it('permits trades during NORMAL tier with full multiplier', () => {
      const breaker = new TieredDrawdownBreaker(100_000, {
        alertThreshold: 0.05, reduceThreshold: 0.10, haltThreshold: 0.15, hardStopThreshold: 0.20,
      });
      breaker.reset(100_000);
      const signal = createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'RANGE' });
      const result = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 100_000, currentPrice: 50_000, drawdownBreaker: breaker,
      });
      expect(result.quantity).toBeGreaterThan(0);
    });

    it('reduces trade size during ALERT tier', () => {
      const breaker = new TieredDrawdownBreaker(100_000, {
        alertThreshold: 0.05, alertSizingReduction: 0.25, reduceThreshold: 0.10,
      });
      breaker.reset(100_000);
      breaker.update(94_000);
      expect(breaker.getState().tier).toBe('ALERT');
      expect(breaker.canOpenNewTrades()).toBe(true);

      const signal = createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'RANGE' });
      const normalResult = sizeSignalToTradeSignal(signal, { portfolioEquity: 94_000, currentPrice: 50_000 });
      const alertResult = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 94_000, currentPrice: 50_000, drawdownBreaker: breaker,
      });
      expect(alertResult.quantity).toBeCloseTo(normalResult.quantity * 0.75, 4);
    });

    it('strictly returns 0 quantity when drawdown reaches REDUCE tier', () => {
      const breaker = new TieredDrawdownBreaker(100_000, { alertThreshold: 0.05, reduceThreshold: 0.10 });
      breaker.reset(100_000);
      breaker.update(89_000);
      expect(breaker.getState().tier).toBe('REDUCE');
      expect(breaker.canOpenNewTrades()).toBe(false);

      const signal = createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'RANGE' });
      const result = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 89_000, currentPrice: 50_000, drawdownBreaker: breaker,
      });
      expect(result.quantity).toBe(0);
    });
  });

  describe('sizeSignalToTradeSignal — Precision & Edge Cases', () => {
    it('truncates quantity to 8 decimal places using floor', () => {
      const signal = createSignal({ confidence: 0.70, expectancy: 0.03, regime: 'RANGE' });
      const result = sizeSignalToTradeSignal(signal, { portfolioEquity: 12345.67, currentPrice: 67890.12 });
      const decimalPlaces = (result.quantity.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(8);
      expect(result.quantity).toBeGreaterThan(0);
    });

    it('returns 0 quantity when price or equity is 0, negative, or non-finite', () => {
      const signal = createSignal();
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: 10000, currentPrice: 0 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: 10000, currentPrice: -100 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: 10000, currentPrice: NaN }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: 10000, currentPrice: Infinity }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: 0, currentPrice: 100 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: -5000, currentPrice: 100 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: NaN, currentPrice: 100 }).quantity).toBe(0);
    });

    it('returns 0 quantity when allocated USD is below minPositionUsd ($1.00) and maps SELL direction', () => {
      const signal = createSignal({ confidence: 0.70, expectancy: 0.03 });
      expect(sizeSignalToTradeSignal(signal, { portfolioEquity: 10, currentPrice: 100, minPositionUsd: 1.0 }).quantity).toBe(0);

      const sellSignal = createSignal({ direction: 'SELL', confidence: 0.75, expectancy: 0.03 });
      const result = sizeSignalToTradeSignal(sellSignal, { portfolioEquity: 10000, currentPrice: 100 });
      expect(result.side).toBe('sell');
      expect(result.quantity).toBeGreaterThan(0);
    });
  });
});
