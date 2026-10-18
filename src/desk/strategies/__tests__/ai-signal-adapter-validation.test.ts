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

    it('returns valid true and empty rejectionReasons when all gates pass (including boundary)', () => {
      const signal = createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'TREND_UP' });
      const result = adapter.validateSignal(signal);
      expect(result.valid).toBe(true);
      expect(result.rejectionReasons).toHaveLength(0);
      expect(result.signal).toBe(signal);

      const boundary = adapter.validateSignal(createSignal({ confidence: 0.70, expectancy: 0.02, regime: 'LOW_VOLATILITY' }));
      expect(boundary.valid).toBe(true);
      expect(boundary.rejectionReasons).toHaveLength(0);
    });

    it('diagnoses confidence hurdle failure with specific threshold message', () => {
      const result = adapter.validateSignal(createSignal({ confidence: 0.65, expectancy: 0.05, regime: 'TREND_UP' }));
      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0]).toContain('Confidence 0.6500 is below threshold 0.7000');
    });

    it('diagnoses expectancy hurdle failure with specific threshold message', () => {
      const result = adapter.validateSignal(createSignal({ confidence: 0.85, expectancy: 0.015, regime: 'TREND_UP' }));
      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0]).toContain('Expectancy 0.0150 is below minimum 0.0200');
    });

    it('diagnoses regime rejection with list of permitted regimes', () => {
      const result = adapter.validateSignal(createSignal({ confidence: 0.85, expectancy: 0.05, regime: 'TREND_DOWN' }));
      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(1);
      expect(result.rejectionReasons[0]).toContain('Regime "TREND_DOWN" is not permitted');
      expect(result.rejectionReasons[0]).toContain('TREND_UP, LOW_VOLATILITY');
    });

    it('accumulates multiple failure reasons when multiple gates fail simultaneously', () => {
      const result = adapter.validateSignal(createSignal({ confidence: 0.50, expectancy: 0.005, regime: 'SHOCK' }));
      expect(result.valid).toBe(false);
      expect(result.rejectionReasons).toHaveLength(3);
      expect(result.rejectionReasons[0]).toContain('Confidence');
      expect(result.rejectionReasons[1]).toContain('Expectancy');
      expect(result.rejectionReasons[2]).toContain('Regime');
    });
  });

  describe('candidateToAISignal', () => {
    const mockSummary = {
      trainSharpeMean: 1.8, testSharpeMean: 1.4, testWinRate: 0.62,
      totalTestTrades: 45, testTotalPnl: 0.18, overfitGap: 0.4,
      consistencyScore: 0.8, sharpeDecay: 0.22,
    };
    const mockCandidate: DiscoveredAlphaCandidate = {
      strategyId: 'alpha-wf-breakout-42',
      familyId: 'momentumBreakout',
      config: { id: 'cfg-42', symbol: 'ETH/USDT', timeframe: '1h', parameters: { lookback: 20 } },
      walkforwardSummary: mockSummary,
      survivalGateResult: { passed: true, verdicts: [] },
      walkforwardResult: {
        steps: [
          { stepIndex: 0, trainMetrics: {} as never, testMetrics: { meanLabel: 0.035 } as never },
          { stepIndex: 1, trainMetrics: {} as never, testMetrics: { meanLabel: 0.045 } as never },
        ],
        summary: mockSummary,
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
      expect(signal.calibratedConfidence).toBeGreaterThan(0);
      expect(signal.calibratedConfidence).toBeLessThanOrEqual(1);
      expect(signal.expectedHoldingPeriod).toBe(20);
      expect(signal.expectancy).toBeCloseTo(0.04, 4);
      expect(signal.regime).toBe('TREND_UP');
      expect(signal.timestamp).toBeGreaterThan(0);
    });

    it('allows overriding symbol via explicit parameter and falls back to BTC/USDT when undefined', () => {
      const signal = candidateToAISignal(mockCandidate, 'RANGE', 'SELL', 'SOL/USDT');
      expect(signal).toMatchObject({ symbol: 'SOL/USDT', direction: 'SELL', action: 'SELL', regime: 'RANGE' });

      const candidateNoSymbol: DiscoveredAlphaCandidate = {
        ...mockCandidate,
        config: { ...mockCandidate.config, symbol: undefined as never },
      };
      expect(candidateToAISignal(candidateNoSymbol, 'TREND_UP', 'BUY').symbol).toBe('BTC/USDT');
    });

    it('derives expectancy from testTotalPnl / totalTestTrades and handles 0 trades safely', () => {
      const candidateSummaryOnly: DiscoveredAlphaCandidate = { ...mockCandidate, walkforwardResult: undefined };
      expect(candidateToAISignal(candidateSummaryOnly, 'TREND_UP', 'BUY').expectancy).toBeCloseTo(0.18 / 45, 4);

      const candidateZeroTrades: DiscoveredAlphaCandidate = {
        ...mockCandidate,
        walkforwardResult: undefined,
        walkforwardSummary: { ...mockCandidate.walkforwardSummary, totalTestTrades: 0, testTotalPnl: 0 },
      };
      expect(candidateToAISignal(candidateZeroTrades, 'TREND_UP', 'BUY').expectancy).toBe(0);
    });
  });
});
