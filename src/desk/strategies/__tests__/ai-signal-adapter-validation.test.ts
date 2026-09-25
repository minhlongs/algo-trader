import { describe, it, expect } from 'vitest';
import {
  AISignalAdapter,
  candidateToAISignal,
  type AISignal,
  type AISignalConfig,
} from '../ai-signal-adapter';
import type { DiscoveredAlphaCandidate } from '../../../alpha-lab/alpha-discovery/continuous-discovery-types';

describe('AISignalAdapter Validation & Candidate Mapping', () => {
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

  describe('validateSignal', () => {
    const adapter = new AISignalAdapter(baseConfig);

    it('returns valid true and empty rejectionReasons when all gates pass', () => {
      const signal = createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'TREND_UP' });
      const result = adapter.validateSignal(signal);

      expect(result.valid).toBe(true);
      expect(result.rejectionReasons).toHaveLength(0);
      expect(result.signal).toBe(signal);
    });

    it('diagnoses confidence hurdle failure with specific threshold message', () => {
      const signal = createSignal({ confidence: 0.65, expectancy: 0.05, regime: 'TREND_UP' });
      const result = adapter.validateSignal(signal);

      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0]).toContain('Confidence 0.6500 is below threshold 0.7000');
    });

    it('diagnoses expectancy hurdle failure with specific threshold message', () => {
      const signal = createSignal({ confidence: 0.85, expectancy: 0.015, regime: 'TREND_UP' });
      const result = adapter.validateSignal(signal);

      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0]).toContain('Expectancy 0.0150 is below minimum 0.0200');
    });

    it('diagnoses regime rejection with list of permitted regimes', () => {
      const signal = createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'TREND_DOWN' });
      const result = adapter.validateSignal(signal);

      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0]).toContain('Regime "TREND_DOWN" is not permitted');
      expect(result.rejectionReasons[0]).toContain('TREND_UP, LOW_VOLATILITY');
    });

    it('accumulates multiple failure reasons when multiple gates fail simultaneously', () => {
      const signal = createSignal({ confidence: 0.50, expectancy: 0.005, regime: 'SHOCK' });
      const result = adapter.validateSignal(signal);

      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(3);
      expect(result.rejectionReasons[0]).toContain('Confidence');
      expect(result.rejectionReasons[1]).toContain('Expectancy');
      expect(result.rejectionReasons[2]).toContain('Regime');
    });

    it('preserves exact boundary values as valid', () => {
      const signal = createSignal({ confidence: 0.70, expectancy: 0.02, regime: 'LOW_VOLATILITY' });
      const result = adapter.validateSignal(signal);

      expect(result.valid).toBe(true);
      expect(result.rejectionReasons).toHaveLength(0);
    });
  });

  describe('candidateToAISignal', () => {
    const mockCandidate: DiscoveredAlphaCandidate = {
      strategyId: 'alpha-wf-breakout-42',
      familyId: 'momentumBreakout',
      config: {
        id: 'cfg-42',
        symbol: 'ETH/USDT',
        timeframe: '1h',
        parameters: { lookback: 20 },
      },
      walkforwardSummary: {
        trainSharpeMean: 1.8,
        testSharpeMean: 1.4,
        testWinRate: 0.62,
        totalTestTrades: 45,
        testTotalPnl: 0.18,
        overfitGap: 0.4,
        consistencyScore: 0.8,
        sharpeDecay: 0.22,
      },
      survivalGateResult: {
        passed: true,
        verdicts: [],
      },
      walkforwardResult: {
        steps: [
          { stepIndex: 0, trainMetrics: {} as never, testMetrics: { meanLabel: 0.035 } as never },
          { stepIndex: 1, trainMetrics: {} as never, testMetrics: { meanLabel: 0.045 } as never },
        ],
        summary: {
          trainSharpeMean: 1.8,
          testSharpeMean: 1.4,
          testWinRate: 0.62,
          totalTestTrades: 45,
          testTotalPnl: 0.18,
          overfitGap: 0.4,
          consistencyScore: 0.8,
          sharpeDecay: 0.22,
        },
      },
    };

    it('maps candidate attributes correctly into AISignal', () => {
      const signal = candidateToAISignal(mockCandidate, 'TREND_UP', 'BUY');

      expect(signal.strategyId).toBe('alpha-wf-breakout-42');
      expect(signal.signalId).toMatch(/^sig-alpha-wf-breakout-42-\d+$/);
      expect(signal.direction).toBe('BUY');
      expect(signal.action).toBe('BUY');
      expect(signal.symbol).toBe('ETH/USDT');
      expect(signal.confidence).toBe(0.62);
      expect(signal.expectancy).toBeCloseTo(0.04, 4); // (0.035 + 0.045) / 2
      expect(signal.regime).toBe('TREND_UP');
      expect(signal.timestamp).toBeGreaterThan(0);
    });

    it('allows overriding symbol via explicit parameter', () => {
      const signal = candidateToAISignal(mockCandidate, 'RANGE', 'SELL', 'SOL/USDT');

      expect(signal.symbol).toBe('SOL/USDT');
      expect(signal.direction).toBe('SELL');
      expect(signal.action).toBe('SELL');
      expect(signal.regime).toBe('RANGE');
    });

    it('falls back to default symbol when candidate.config.symbol is undefined', () => {
      const candidateNoSymbol: DiscoveredAlphaCandidate = {
        ...mockCandidate,
        config: { ...mockCandidate.config, symbol: undefined as never },
      };
      const signal = candidateToAISignal(candidateNoSymbol, 'TREND_UP', 'BUY');

      expect(signal.symbol).toBe('BTC/USDT');
    });

    it('derives expectancy from testTotalPnl / totalTestTrades when steps meanLabel is omitted', () => {
      const candidateSummaryOnly: DiscoveredAlphaCandidate = {
        ...mockCandidate,
        walkforwardResult: undefined,
      };
      const signal = candidateToAISignal(candidateSummaryOnly, 'TREND_UP', 'BUY');

      expect(signal.expectancy).toBeCloseTo(0.18 / 45, 4); // 0.004
    });

    it('handles candidate with 0 trades safely with 0 expectancy', () => {
      const candidateZeroTrades: DiscoveredAlphaCandidate = {
        ...mockCandidate,
        walkforwardResult: undefined,
        walkforwardSummary: {
          ...mockCandidate.walkforwardSummary,
          totalTestTrades: 0,
          testTotalPnl: 0,
        },
      };
      const signal = candidateToAISignal(candidateZeroTrades, 'TREND_UP', 'BUY');

      expect(signal.expectancy).toBe(0);
    });
  });
});
