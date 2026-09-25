import { describe, it, expect } from 'vitest';
import {
  AISignalAdapter,
  type AISignal,
  type AISignalConfig,
} from '../ai-signal-adapter';
import type { MetricsReport } from '../../backtesting/types';

describe('AISignalAdapter Scoring & Robustness', () => {
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

  describe('scoreStrategy', () => {
    const adapter = new AISignalAdapter(baseConfig);

    const baseMetrics: MetricsReport = {
      totalTrades: 100,
      winningTrades: 60,
      losingTrades: 40,
      winRate: 0.6,
      profitFactor: 2.0,
      sharpeRatio: 1.8,
      maxDrawdown: 0.12,
      totalPnl: 0.05,
      bestTrade: 0.04,
      worstTrade: -0.015,
      avgPnlPerTrade: 0.0005,
    };

    it('computes composite score for healthy strategy', () => {
      const score = adapter.scoreStrategy(baseMetrics);

      expect(score).toBeCloseTo(0.74, 2);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('returns near 0 for terrible metrics (0 win rate, 0 pnl, 0 profit factor)', () => {
      const zeroMetrics: MetricsReport = {
        ...baseMetrics,
        winRate: 0,
        totalPnl: 0,
        profitFactor: 0,
      };
      const score = adapter.scoreStrategy(zeroMetrics);

      expect(score).toBe(0);
    });

    it('clamps negative PnL contribution to zero rather than subtracting', () => {
      const lossMetrics: MetricsReport = {
        ...baseMetrics,
        winRate: 0.5,
        totalPnl: -0.10,
        profitFactor: 0.8,
      };
      const score = adapter.scoreStrategy(lossMetrics);

      expect(score).toBeCloseTo(0.333, 2);
    });

    it('clamps composite score to maximum 1.0 on extremely high values', () => {
      const extremeMetrics: MetricsReport = {
        ...baseMetrics,
        winRate: 1.0,
        totalPnl: 0.50,
        profitFactor: 50.0,
      };
      const score = adapter.scoreStrategy(extremeMetrics);

      expect(score).toBeCloseTo(0.994, 2);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Adversarial Robustness & Input Sanitization', () => {
    const adapter = new AISignalAdapter(baseConfig);

    it('rejects signal with null confidence without throwing TypeError', () => {
      const signal = createSignal({ confidence: (null as unknown) as number });
      expect(() => adapter.validateSignal(signal)).not.toThrow();
      const res = adapter.validateSignal(signal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons.some((r) => r.includes('Confidence'))).toBe(true);
      expect(adapter.evaluateSignal(signal)).toBe(false);
    });

    it('rejects signal with null expectancy without throwing TypeError', () => {
      const signal = createSignal({ expectancy: (null as unknown) as number });
      expect(() => adapter.validateSignal(signal)).not.toThrow();
      const res = adapter.validateSignal(signal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons.some((r) => r.includes('Expectancy'))).toBe(true);
      expect(adapter.evaluateSignal(signal)).toBe(false);
    });

    it('rejects signal with NaN confidence or expectancy', () => {
      const nanSignal = createSignal({ confidence: NaN, expectancy: NaN });
      const res = adapter.validateSignal(nanSignal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons.length).toBeGreaterThanOrEqual(2);
      expect(adapter.evaluateSignal(nanSignal)).toBe(false);
    });

    it('rejects signal with undefined confidence or expectancy', () => {
      const undefSignal = createSignal({
        confidence: (undefined as unknown) as number,
        expectancy: (undefined as unknown) as number,
      });
      const res = adapter.validateSignal(undefSignal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons.length).toBeGreaterThanOrEqual(2);
      expect(adapter.evaluateSignal(undefSignal)).toBe(false);
    });

    it('rejects out-of-bounds confidence > 1.0 (e.g. 1.50)', () => {
      const oobSignal = createSignal({ confidence: 1.5 });
      const res = adapter.validateSignal(oobSignal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons[0]).toContain('Confidence');
      expect(adapter.evaluateSignal(oobSignal)).toBe(false);
    });

    it('rejects out-of-bounds confidence < 0.0 (e.g. -0.20)', () => {
      const negSignal = createSignal({ confidence: -0.2 });
      const res = adapter.validateSignal(negSignal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons[0]).toContain('Confidence');
      expect(adapter.evaluateSignal(negSignal)).toBe(false);
    });

    it('rejects non-finite Infinity expectancy', () => {
      const infSignal = createSignal({ expectancy: Infinity });
      const res = adapter.validateSignal(infSignal);
      expect(res.valid).toBe(false);
      expect(res.rejectionReasons[0]).toContain('Expectancy');
      expect(adapter.evaluateSignal(infSignal)).toBe(false);
    });

    it('handles null and undefined signal root object gracefully', () => {
      expect(() => adapter.validateSignal((null as unknown) as AISignal)).not.toThrow();
      expect(adapter.validateSignal((null as unknown) as AISignal).valid).toBe(false);
      expect(adapter.evaluateSignal((null as unknown) as AISignal)).toBe(false);
      expect(adapter.filterByRegime((null as unknown) as AISignal)).toBe(false);
    });
  });
});
