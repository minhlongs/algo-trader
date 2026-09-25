import { describe, it, expect } from 'vitest';
import {
  RegimeAwareKelly,
  sizeSignalToTradeSignal,
} from '../regime-aware-kelly';
import type { AISignal } from '../../strategies/ai-signal-adapter';

describe('RegimeAwareKelly Sizing & Multipliers Test Suite', () => {
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

  // ==========================================================================
  // 1. RegimeAwareKelly.size() portfolioPercent scaling fix
  // ==========================================================================
  describe('RegimeAwareKelly.size() portfolioPercent scaling', () => {
    it('updates portfolioPercent dynamically according to regime multiplier', () => {
      const sizer = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.25, maxPositionFraction: 0.05 },
        regimeMultipliers: {},
        unknownRegimeMultiplier: 0.75,
      });

      const portfolioValue = 100_000;
      // High win prob & win loss ratio so Kelly maxes out at 5% base cap ($5,000)
      const input = { winProbability: 0.8, winLossRatio: 2.0, portfolioValue };

      // RANGE (1.00x) -> $5,000 -> 5.0%
      const rangeRes = sizer.size(input, 'RANGE');
      expect(rangeRes.positionSizeUsd).toBe(5000);
      expect(rangeRes.portfolioPercent).toBeCloseTo(5.0, 4);

      // TREND_UP (1.25x) -> $6,250 -> 6.25%
      const upRes = sizer.size(input, 'TREND_UP');
      expect(upRes.positionSizeUsd).toBe(6250);
      expect(upRes.portfolioPercent).toBeCloseTo(6.25, 4);

      // TREND_DOWN (0.50x) -> $2,500 -> 2.5%
      const downRes = sizer.size(input, 'TREND_DOWN');
      expect(downRes.positionSizeUsd).toBe(2500);
      expect(downRes.portfolioPercent).toBeCloseTo(2.5, 4);

      // SHOCK (0.00x) -> $0 -> 0.0%
      const shockRes = sizer.size(input, 'SHOCK');
      expect(shockRes.positionSizeUsd).toBe(0);
      expect(shockRes.portfolioPercent).toBe(0);

      // LOW_VOLATILITY (1.10x) -> $5,500 -> 5.5%
      const lowVolRes = sizer.size(input, 'LOW_VOLATILITY');
      expect(lowVolRes.positionSizeUsd).toBe(5500);
      expect(lowVolRes.portfolioPercent).toBeCloseTo(5.5, 4);
    });
  });

  // ==========================================================================
  // 2. sizeSignalToTradeSignal — 7-state Regime Multipliers & Flat SHOCK
  // ==========================================================================
  describe('sizeSignalToTradeSignal — Regime Multipliers', () => {
    const portfolioEquity = 100_000;
    const currentPrice = 50_000;

    it('enforces strictly 0 quantity in SHOCK regime', () => {
      const signal = createSignal({ regime: 'SHOCK', confidence: 0.90, expectancy: 0.10 });
      const tradeSignal = sizeSignalToTradeSignal(signal, {
        portfolioEquity,
        currentPrice,
      });

      expect(tradeSignal.quantity).toBe(0);
      expect(tradeSignal.side).toBe('buy');
      expect(tradeSignal.symbol).toBe('BTC/USDT');
    });

    it('enforces strict 5% maximum portfolio cap by default in TREND_UP regime', () => {
      const signal = createSignal({ regime: 'TREND_UP', confidence: 0.85, expectancy: 0.08 });
      const tradeSignal = sizeSignalToTradeSignal(signal, {
        portfolioEquity,
        currentPrice,
        strictMaxCap: true,
      });

      // 5% of 100,000 = $5,000 max. At $50,000/BTC, quantity = 5,000 / 50,000 = 0.1 BTC
      expect(tradeSignal.quantity).toBe(0.1);
      const allocatedUsd = tradeSignal.quantity * currentPrice;
      expect(allocatedUsd).toBeLessThanOrEqual(portfolioEquity * 0.05);
    });

    it('scales allocation in TREND_DOWN to 50% of base size', () => {
      const sizer = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.25, maxPositionFraction: 0.10 },
        regimeMultipliers: {},
        unknownRegimeMultiplier: 0.75,
      });

      const rangeSignal = createSignal({ regime: 'RANGE', confidence: 0.60, expectancy: 0.02 });
      const downSignal = createSignal({ regime: 'TREND_DOWN', confidence: 0.60, expectancy: 0.02 });

      const rangeRes = sizeSignalToTradeSignal(rangeSignal, {
        portfolioEquity,
        currentPrice,
        regimeKelly: sizer,
        strictMaxCap: false,
      });

      const downRes = sizeSignalToTradeSignal(downSignal, {
        portfolioEquity,
        currentPrice,
        regimeKelly: sizer,
        strictMaxCap: false,
      });

      expect(rangeRes.quantity).toBeGreaterThan(0);
      expect(downRes.quantity).toBeCloseTo(rangeRes.quantity * 0.50, 4);
    });

    it('applies UNKNOWN regime fallback multiplier (0.75x)', () => {
      const sizer = new RegimeAwareKelly({
        kelly: { kellyFraction: 0.25, maxPositionFraction: 0.10 },
        regimeMultipliers: {},
        unknownRegimeMultiplier: 0.75,
      });

      const rangeSignal = createSignal({ regime: 'RANGE', confidence: 0.60, expectancy: 0.02 });
      const unknownSignal = createSignal({ regime: 'UNKNOWN', confidence: 0.60, expectancy: 0.02 });

      const rangeRes = sizeSignalToTradeSignal(rangeSignal, {
        portfolioEquity,
        currentPrice,
        regimeKelly: sizer,
        strictMaxCap: false,
      });

      const unknownRes = sizeSignalToTradeSignal(unknownSignal, {
        portfolioEquity,
        currentPrice,
        regimeKelly: sizer,
        strictMaxCap: false,
      });

      expect(unknownRes.quantity).toBeCloseTo(rangeRes.quantity * 0.75, 4);
    });
  });
});
