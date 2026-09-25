/**
 * Empirical Stress Test Harness: Regime-Aware Kelly Boundary Values & 5% Cap Ceiling
 */

import { describe, it, expect } from 'vitest';
import { sizeSignalToTradeSignal } from '../regime-aware-kelly';
import type { AISignal } from '../../strategies/ai-signal-adapter';
import type { MarketRegime } from '../../../alpha-lab/regimes/regime-types';

describe('Regime-Aware Kelly Stress: Boundaries & Caps', () => {
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
  // 1. Boundary Values for Win Rate p, Expectancy, and Extreme Odds
  // ==========================================================================
  describe('Boundary values: p -> 0, p -> 1, p = 0.5, expectancy <= 0, extreme odds', () => {
    it('enforces 0 quantity when win rate p <= 0 or p >= 1', () => {
      const pZero = makeSignal({ confidence: 0 });
      const pNeg = makeSignal({ confidence: -0.2 });
      const pOne = makeSignal({ confidence: 1.0 });
      const pOverOne = makeSignal({ confidence: 1.25 });

      expect(sizeSignalToTradeSignal(pZero, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(pNeg, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(pOne, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);
      expect(sizeSignalToTradeSignal(pOverOne, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);
    });

    it('handles infinitesimal win rate p -> 0 gracefully without NaN or negative allocation', () => {
      const pInfinitesimal = makeSignal({ confidence: 1e-12, expectancy: 0.02 });
      const res = sizeSignalToTradeSignal(pInfinitesimal, { portfolioEquity: 100_000, currentPrice: 50_000 });

      expect(Number.isFinite(res.quantity)).toBe(true);
      expect(res.quantity).toBeGreaterThanOrEqual(0);
      expect(res.quantity).toBe(0);
    });

    it('caps allocation at 5% for near-certain win rate p -> 1 (e.g. p = 0.999999)', () => {
      const pNearOne = makeSignal({ confidence: 0.999999, expectancy: 0.05, regime: 'RANGE' });
      const res = sizeSignalToTradeSignal(pNearOne, { portfolioEquity: 100_000, currentPrice: 50_000 });

      expect(res.quantity).toBe(0.1);
      expect(res.quantity * 50_000).toBeLessThanOrEqual(100_000 * 0.05);
    });

    it('handles p = 0.5 accurately based on expectancy', () => {
      const zeroE = makeSignal({ confidence: 0.5, expectancy: 0 });
      expect(sizeSignalToTradeSignal(zeroE, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);

      const negE = makeSignal({ confidence: 0.5, expectancy: -0.05 });
      expect(sizeSignalToTradeSignal(negE, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);

      const posE = makeSignal({ confidence: 0.5, expectancy: 0.05, regime: 'RANGE' });
      const res = sizeSignalToTradeSignal(posE, { portfolioEquity: 100_000, currentPrice: 50_000 });
      expect(res.quantity).toBeCloseTo(0.02272727, 6);
      expect(res.quantity * 50_000).toBeLessThan(100_000 * 0.05);
    });

    it('strictly produces 0 quantity for negative or zero expectancy across all regimes', () => {
      const allRegimes: MarketRegime[] = [
        'TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK', 'UNKNOWN',
      ];

      for (const reg of allRegimes) {
        const zeroSig = makeSignal({ confidence: 0.8, expectancy: 0, regime: reg });
        const negSig = makeSignal({ confidence: 0.8, expectancy: -0.1, regime: reg });

        expect(sizeSignalToTradeSignal(zeroSig, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);
        expect(sizeSignalToTradeSignal(negSig, { portfolioEquity: 100_000, currentPrice: 50_000 }).quantity).toBe(0);
      }
    });

    it('handles extreme odds (lottery-ticket high payoff vs low payoff high win rate)', () => {
      const lotterySig = makeSignal({ confidence: 0.01, expectancy: 100, regime: 'RANGE' });
      const lotteryRes = sizeSignalToTradeSignal(lotterySig, { portfolioEquity: 100_000, currentPrice: 50_000 });
      expect(Number.isFinite(lotteryRes.quantity)).toBe(true);
      expect(lotteryRes.quantity).toBeGreaterThan(0);
      expect(lotteryRes.quantity * 50_000).toBeLessThanOrEqual(100_000 * 0.05);

      const lowPayoffSig = makeSignal({ confidence: 0.99, expectancy: 0.0001, regime: 'RANGE' });
      const lowPayoffRes = sizeSignalToTradeSignal(lowPayoffSig, { portfolioEquity: 100_000, currentPrice: 50_000 });
      expect(Number.isFinite(lowPayoffRes.quantity)).toBe(true);
      expect(lowPayoffRes.quantity).toBeGreaterThan(0);
      expect(lowPayoffRes.quantity * 50_000).toBeLessThanOrEqual(100_000 * 0.05);
    });
  });

  // ==========================================================================
  // 2. Strict 5% Cap Ceiling Enforcement Across Scale Matrix
  // ==========================================================================
  describe('Strict 5% cap ceiling enforcement across large portfolio values and high confidence signals', () => {
    const portfolioScales = [
      100, 1_000, 10_000, 100_000, 1_000_000, 100_000_000, 1_000_000_000, 1_000_000_000_000,
    ];

    const assetPrices = [0.0000001, 0.01, 1.0, 100.0, 50_000.0, 1_000_000.0];

    const highConfidenceSignals = [
      { confidence: 0.80, expectancy: 0.10 },
      { confidence: 0.90, expectancy: 0.25 },
      { confidence: 0.99, expectancy: 0.50 },
    ];

    it('guarantees allocated USD never exceeds 5% across scale/price permutations in TREND_UP', () => {
      for (const equity of portfolioScales) {
        for (const price of assetPrices) {
          for (const sigParams of highConfidenceSignals) {
            const signal = makeSignal({
              confidence: sigParams.confidence,
              expectancy: sigParams.expectancy,
              regime: 'TREND_UP',
            });

            const trade = sizeSignalToTradeSignal(signal, {
              portfolioEquity: equity,
              currentPrice: price,
              strictMaxCap: true,
            });

            const allocatedUsd = trade.quantity * price;
            const maxAllowedUsd = equity * 0.05;

            expect(allocatedUsd).toBeLessThanOrEqual(maxAllowedUsd + 1e-9);
            expect(Number.isFinite(trade.quantity)).toBe(true);
            expect(trade.quantity).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('allows opt-out via strictMaxCap=false', () => {
      const signal = makeSignal({
        confidence: 0.90,
        expectancy: 0.20,
        regime: 'TREND_UP',
      });

      const unconstrainedTrade = sizeSignalToTradeSignal(signal, {
        portfolioEquity: 100_000,
        currentPrice: 50_000,
        strictMaxCap: false,
      });

      expect(unconstrainedTrade.quantity).toBe(0.125);
      expect(unconstrainedTrade.quantity * 50_000).toBeCloseTo(6_250, 2);
    });
  });
});
