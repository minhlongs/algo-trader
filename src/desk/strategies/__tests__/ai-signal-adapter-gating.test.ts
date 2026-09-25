import { describe, it, expect } from 'vitest';
import {
  AISignalAdapter,
  type AISignal,
  type AISignalConfig,
} from '../ai-signal-adapter';
import type { MarketRegime } from '../../../alpha-lab/regimes/regime-types';

describe('AISignalAdapter Gating: evaluateSignal & filterByRegime', () => {
  const baseConfig: AISignalConfig = {
    confidenceThreshold: 0.7,
    minExpectancy: 0.02,
    regimeFilter: ['TREND_UP', 'LOW_VOLATILITY'],
  };

  const createSignal = (overrides: Partial<AISignal> = {}): AISignal => ({
    strategyId: 'strat-momentum-01',
    direction: 'BUY',
    confidence: 0.85,
    expectancy: 0.04,
    regime: 'TREND_UP',
    timestamp: 1700000000000,
    symbol: 'BTC/USDT',
    ...overrides,
  });

  describe('evaluateSignal', () => {
    const adapter = new AISignalAdapter(baseConfig);

    it('accepts signal when both confidence and expectancy exceed thresholds', () => {
      const signal = createSignal({ confidence: 0.85, expectancy: 0.05 });
      expect(adapter.evaluateSignal(signal)).toBe(true);
    });

    it('accepts signal on exact threshold boundaries', () => {
      const signal = createSignal({ confidence: 0.70, expectancy: 0.02 });
      expect(adapter.evaluateSignal(signal)).toBe(true);
    });

    it('rejects signal when confidence is just below threshold', () => {
      const signal = createSignal({ confidence: 0.6999, expectancy: 0.05 });
      expect(adapter.evaluateSignal(signal)).toBe(false);
    });

    it('rejects signal when expectancy is just below threshold', () => {
      const signal = createSignal({ confidence: 0.85, expectancy: 0.0199 });
      expect(adapter.evaluateSignal(signal)).toBe(false);
    });

    it('rejects signal with negative expectancy', () => {
      const signal = createSignal({ confidence: 0.95, expectancy: -0.01 });
      expect(adapter.evaluateSignal(signal)).toBe(false);
    });

    it('rejects signal when both confidence and expectancy fail', () => {
      const signal = createSignal({ confidence: 0.50, expectancy: 0.005 });
      expect(adapter.evaluateSignal(signal)).toBe(false);
    });
  });

  describe('filterByRegime', () => {
    it('accepts all 7 regimes when regimeFilter is omitted or empty', () => {
      const openAdapter1 = new AISignalAdapter({ confidenceThreshold: 0.5, minExpectancy: 0.01 });
      const openAdapter2 = new AISignalAdapter({ confidenceThreshold: 0.5, minExpectancy: 0.01, regimeFilter: [] });

      const allRegimes: MarketRegime[] = [
        'TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK', 'UNKNOWN',
      ];

      for (const regime of allRegimes) {
        const signal = createSignal({ regime });
        expect(openAdapter1.filterByRegime(signal)).toBe(true);
        expect(openAdapter2.filterByRegime(signal)).toBe(true);
      }
    });

    it('accepts signals within the configured whitelist', () => {
      const adapter = new AISignalAdapter(baseConfig);
      expect(adapter.filterByRegime(createSignal({ regime: 'TREND_UP' }))).toBe(true);
      expect(adapter.filterByRegime(createSignal({ regime: 'LOW_VOLATILITY' }))).toBe(true);
    });

    it('rejects signals outside the configured whitelist', () => {
      const adapter = new AISignalAdapter(baseConfig);
      expect(adapter.filterByRegime(createSignal({ regime: 'TREND_DOWN' }))).toBe(false);
      expect(adapter.filterByRegime(createSignal({ regime: 'RANGE' }))).toBe(false);
      expect(adapter.filterByRegime(createSignal({ regime: 'HIGH_VOLATILITY' }))).toBe(false);
      expect(adapter.filterByRegime(createSignal({ regime: 'UNKNOWN' }))).toBe(false);
    });

    it('strictly rejects SHOCK regime when not explicitly in whitelist', () => {
      const adapter = new AISignalAdapter(baseConfig);
      expect(adapter.filterByRegime(createSignal({ regime: 'SHOCK' }))).toBe(false);
    });

    it('works with a single-element whitelist', () => {
      const singleAdapter = new AISignalAdapter({
        confidenceThreshold: 0.5,
        minExpectancy: 0.01,
        regimeFilter: ['TREND_UP'],
      });
      expect(singleAdapter.filterByRegime(createSignal({ regime: 'TREND_UP' }))).toBe(true);
      expect(singleAdapter.filterByRegime(createSignal({ regime: 'LOW_VOLATILITY' }))).toBe(false);
    });
  });
});
