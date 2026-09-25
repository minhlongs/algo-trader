/**
 * Empirical Stress Test Harness: 7 Regimes, Drawdown Breaker, & Adversarial Robustness
 */

import { describe, it, expect } from 'vitest';
import {
  sizeSignalToTradeSignal,
  DEFAULT_MULTIPLIERS,
} from '../regime-aware-kelly';
import { TieredDrawdownBreaker } from '../tiered-drawdown-breaker';
import type { AISignal } from '../../strategies/ai-signal-adapter';
import type { MarketRegime } from '../../../alpha-lab/regimes/regime-types';

describe('Regime-Aware Kelly Stress: Regimes, Breakers & Robustness', () => {
  const makeSignal = (overrides: Partial<AISignal> = {}): AISignal => ({
    strategyId: 'challenger-test-strat',
    direction: 'BUY',
    confidence: 0.70,
    expectancy: 0.04,
    regime: 'RANGE',
    timestamp: 1700000000000,
    symbol: 'BTC/USDT',
    ...overrides,
  });

  // ==========================================================================
  // 1. 7-State Regime Multipliers & Strictly Flat SHOCK
  // ==========================================================================
  describe('7-State Regime Multipliers & Flat SHOCK enforcement', () => {
    it('verifies exact DEFAULT_MULTIPLIERS specification', () => {
      expect(DEFAULT_MULTIPLIERS.TREND_UP).toBe(1.25);
      expect(DEFAULT_MULTIPLIERS.TREND_DOWN).toBe(0.50);
      expect(DEFAULT_MULTIPLIERS.RANGE).toBe(1.00);
      expect(DEFAULT_MULTIPLIERS.HIGH_VOLATILITY).toBe(0.50);
      expect(DEFAULT_MULTIPLIERS.LOW_VOLATILITY).toBe(1.10);
      expect(DEFAULT_MULTIPLIERS.SHOCK).toBe(0.00);
      expect(DEFAULT_MULTIPLIERS.UNKNOWN).toBe(0.75);
    });

    it('strictly enforces 0 allocation in SHOCK regime regardless of parameters', () => {
      const highConvictionShock = makeSignal({
        confidence: 0.99,
        expectancy: 1.0,
        regime: 'SHOCK',
      });

      const trade = sizeSignalToTradeSignal(highConvictionShock, {
        portfolioEquity: 10_000_000,
        currentPrice: 50_000,
        strictMaxCap: false,
      });

      expect(trade.quantity).toBe(0);
      expect(trade.side).toBe('buy');
    });

    it('scales uncapped allocations proportionally according to all 7 multipliers', () => {
      const baseSignal = makeSignal({ confidence: 0.60, expectancy: 0.02, regime: 'RANGE' });
      const rangeRes = sizeSignalToTradeSignal(baseSignal, { portfolioEquity: 100_000, currentPrice: 100 });
      const baseQty = rangeRes.quantity;

      const expectedMultipliers: Record<MarketRegime, number> = {
        TREND_UP: 1.25,
        TREND_DOWN: 0.50,
        RANGE: 1.00,
        HIGH_VOLATILITY: 0.50,
        LOW_VOLATILITY: 1.10,
        SHOCK: 0.00,
        UNKNOWN: 0.75,
      };

      for (const [regime, mult] of Object.entries(expectedMultipliers) as [MarketRegime, number][]) {
        const sig = makeSignal({ confidence: 0.60, expectancy: 0.02, regime });
        const res = sizeSignalToTradeSignal(sig, { portfolioEquity: 100_000, currentPrice: 100 });

        if (regime === 'SHOCK') {
          expect(res.quantity).toBe(0);
        } else {
          expect(res.quantity).toBeCloseTo(baseQty * mult, 4);
        }
      }
    });
  });

  // ==========================================================================
  // 2. TieredDrawdownBreaker Protection & Tier Progression
  // ==========================================================================
  describe('TieredDrawdownBreaker blocks trading and attenuates sizing across all tiers', () => {
    it('evaluates individual tiers: NORMAL, ALERT, REDUCE, HALT, HARD_STOP, and DAILY_PAUSE', () => {
      const breaker = new TieredDrawdownBreaker(100_000, {
        alertThreshold: 0.05,
        reduceThreshold: 0.10,
        haltThreshold: 0.15,
        hardStopThreshold: 0.20,
        dailyLossThreshold: 0.03,
      });

      // 1. NORMAL (0% DD)
      breaker.reset(100_000);
      expect(breaker.getState().tier).toBe('NORMAL');
      expect(breaker.canOpenNewTrades()).toBe(true);
      expect(breaker.getSizingMultiplier()).toBe(1.0);

      let trade = sizeSignalToTradeSignal(makeSignal(), { portfolioEquity: 100_000, currentPrice: 50_000, drawdownBreaker: breaker });
      expect(trade.quantity).toBeGreaterThan(0);

      // 2. ALERT (6% DD)
      breaker.reset(100_000);
      breaker.update(94_000);
      expect(breaker.getState().tier).toBe('ALERT');
      expect(breaker.canOpenNewTrades()).toBe(true);
      expect(breaker.getSizingMultiplier()).toBe(0.75);

      trade = sizeSignalToTradeSignal(makeSignal(), { portfolioEquity: 94_000, currentPrice: 50_000, drawdownBreaker: breaker });
      expect(trade.quantity).toBeGreaterThan(0);

      // 3. REDUCE (11% DD)
      breaker.reset(100_000);
      breaker.update(89_000);
      expect(breaker.getState().tier).toBe('REDUCE');
      expect(breaker.canOpenNewTrades()).toBe(false);

      trade = sizeSignalToTradeSignal(makeSignal(), { portfolioEquity: 89_000, currentPrice: 50_000, drawdownBreaker: breaker });
      expect(trade.quantity).toBe(0);

      // 4. HALT (16% DD)
      breaker.reset(100_000);
      breaker.update(84_000);
      expect(breaker.getState().tier).toBe('HALT');
      expect(breaker.canOpenNewTrades()).toBe(false);

      trade = sizeSignalToTradeSignal(makeSignal(), { portfolioEquity: 84_000, currentPrice: 50_000, drawdownBreaker: breaker });
      expect(trade.quantity).toBe(0);

      // 5. HARD_STOP (21% DD)
      breaker.reset(100_000);
      breaker.update(79_000);
      expect(breaker.getState().tier).toBe('HARD_STOP');
      expect(breaker.canOpenNewTrades()).toBe(false);

      trade = sizeSignalToTradeSignal(makeSignal(), { portfolioEquity: 79_000, currentPrice: 50_000, drawdownBreaker: breaker });
      expect(trade.quantity).toBe(0);

      // 6. DAILY_PAUSE (4% daily drop from daily start value)
      breaker.reset(100_000);
      breaker.update(96_000);
      expect(breaker.getState().tier).toBe('DAILY_PAUSE');
      expect(breaker.canOpenNewTrades()).toBe(false);

      trade = sizeSignalToTradeSignal(makeSignal(), { portfolioEquity: 96_000, currentPrice: 50_000, drawdownBreaker: breaker });
      expect(trade.quantity).toBe(0);
    });

    it('escalates from HALT to HARD_STOP during catastrophic collapse in halt window', () => {
      const breaker = new TieredDrawdownBreaker(100_000);
      breaker.reset(100_000);

      breaker.update(84_000);
      expect(breaker.getState().tier).toBe('HALT');
      expect(breaker.getPositionsToCloseFraction()).toBe(0.5);

      breaker.update(50_000);

      const stateDuringCollapse = breaker.getState();
      expect(stateDuringCollapse.tier).toBe('HARD_STOP');
      expect(breaker.getPositionsToCloseFraction()).toBe(1.0);
    });
  });

  // ==========================================================================
  // 3. Adversarial Robustness: Non-Finite Values (NaN, undefined, Infinity)
  // ==========================================================================
  describe('Adversarial Robustness: Handling of Non-Finite Inputs', () => {
    it('handles NaN confidence safely by returning quantity 0', () => {
      const nanConfidenceSignal = makeSignal({ confidence: NaN, expectancy: 0.05 });
      const trade = sizeSignalToTradeSignal(nanConfidenceSignal, { portfolioEquity: 100_000, currentPrice: 50_000 });

      expect(Number.isFinite(trade.quantity)).toBe(true);
      expect(trade.quantity).toBe(0);
    });

    it('handles NaN expectancy safely by returning quantity 0', () => {
      const nanExpectancySignal = makeSignal({ confidence: 0.70, expectancy: NaN });
      const trade = sizeSignalToTradeSignal(nanExpectancySignal, { portfolioEquity: 100_000, currentPrice: 50_000 });

      expect(Number.isFinite(trade.quantity)).toBe(true);
      expect(trade.quantity).toBe(0);
    });
  });
});
