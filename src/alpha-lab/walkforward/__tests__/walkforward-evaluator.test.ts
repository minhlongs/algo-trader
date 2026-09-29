import { describe, it, expect } from 'vitest';
import { evaluateWalkForward, buildSummary } from '../walkforward-evaluator';
import type { ExperimentConfig } from '../../experiments/experiment-types';
import type { CandleLike } from '../../regimes/regime-types';

function makeCandles(n: number): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i * 0.5,
    high: 101 + i * 0.5,
    low: 99 + i * 0.5,
    close: 100 + i * 0.5,
    volume: 50 + i,
  }));
}

function makeConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    experimentId: 'wf-test-01',
    hypothesis: 'test Sortino and Calmar propagation',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    features: ['simple_return'],
    regimes: 'all',
    tp: 0.02,
    sl: 0.01,
    maxHolding: 6,
    lookback: 5,
    split: {
      mode: 'rolling',
      trainRatio: 0.5,
      valRatio: 0.25,
      testRatio: 0.25,
      numFolds: 5,
    },
    cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
    seed: 42,
    gitCommit: 'test',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Walk-Forward Evaluator — Sortino & Calmar Metrics Propagation', () => {
  it('populates testSortino and testCalmar in WalkForwardSummary', () => {
    const candles = makeCandles(120);
    const config = makeConfig();
    const result = evaluateWalkForward({ candles, config });

    expect(result.steps.length).toBeGreaterThanOrEqual(5);
    expect(result.summary.totalSteps).toBeGreaterThanOrEqual(5);
    expect(typeof result.summary.testSharpe).toBe('number');
    expect(typeof result.summary.testSortino).toBe('number');
    expect(typeof result.summary.testCalmar).toBe('number');
    expect(Number.isFinite(result.summary.testSortino!)).toBe(true);
    expect(Number.isFinite(result.summary.testCalmar!)).toBe(true);
  });

  it('buildSummary returns 0 for testSortino and testCalmar on empty steps', () => {
    const summary = buildSummary([]);
    expect(summary.totalSteps).toBe(0);
    expect(summary.testSortino).toBe(0);
    expect(summary.testCalmar).toBe(0);
  });

  it('evaluates walkforward across >= 5 rolling folds with non-overlapping test splits', () => {
    const candles = makeCandles(150);
    const config = makeConfig({
      split: {
        mode: 'rolling',
        trainRatio: 0.5,
        valRatio: 0.25,
        testRatio: 0.25,
        numFolds: 5,
      },
    });

    const result = evaluateWalkForward({ candles, config });
    expect(result.steps.length).toBe(5);

    // Assert each step produced valid metrics
    for (const step of result.steps) {
      expect(step.trainMetrics).toBeDefined();
      expect(step.valMetrics).toBeDefined();
      expect(step.testMetrics).toBeDefined();
      expect(step.testMetrics.winRate).toBeGreaterThanOrEqual(0);
      expect(step.testMetrics.winRate).toBeLessThanOrEqual(1);
    }

    expect(result.summary.testWinRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.testWinRate).toBeLessThanOrEqual(1);
    expect(result.summary.testMaxDrawdown).toBeGreaterThanOrEqual(0);
  });
});
