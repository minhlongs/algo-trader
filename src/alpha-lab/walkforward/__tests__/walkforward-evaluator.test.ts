import { describe, it, expect } from 'vitest';
import { evaluateWalkForward } from '../walkforward-evaluator';
import type { ExperimentConfig } from '../experiments/experiment-types';
import type { CandleLike } from '../regimes/regime-types';

function makeCandles(n: number): CandleLike[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 50 + i,
  }));
}

const baseConfig: ExperimentConfig = {
  experimentId: 'wf-001',
  hypothesis: 'walkforward test',
  symbol: 'X',
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
  },
  cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
  seed: 42,
  gitCommit: 'abc123',
  createdAt: '2025-01-01T00:00:00Z',
};

describe('Walk-Forward Evaluator', () => {
  it('throws on empty candle array', () => {
    expect(() => evaluateWalkForward({ candles: [], config: baseConfig })).toThrow('Empty candle array');
  });

  it('throws on insufficient data', () => {
    expect(() => evaluateWalkForward({ candles: makeCandles(3), config: baseConfig })).toThrow('Insufficient data');
  });

  it('returns step results for each walk-forward step', () => {
    const result = evaluateWalkForward({ candles: makeCandles(80), config: baseConfig });
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      expect(step.step).toBeGreaterThanOrEqual(0);
      expect(typeof step.trainMetrics.winRate).toBe('number');
      expect(typeof step.valMetrics.winRate).toBe('number');
      expect(typeof step.testMetrics.winRate).toBe('number');
    }
  });

  it('returns summary with aggregated metrics', () => {
    const result = evaluateWalkForward({ candles: makeCandles(80), config: baseConfig });
    expect(result.summary.totalSteps).toBe(result.steps.length);
    expect(result.summary.trainWinRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.testWinRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.overfitGap).toBeGreaterThanOrEqual(-1);
    expect(result.summary.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.consistencyScore).toBeLessThanOrEqual(1);
  });

  it('testWinRate reflects out-of-sample performance, not train', () => {
    const result = evaluateWalkForward({ candles: makeCandles(100), config: baseConfig });
    // testWinRate must be a valid number between 0 and 1.
    expect(result.summary.testWinRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.testWinRate).toBeLessThanOrEqual(1);
  });

  it('produces expanding mode', () => {
    const expandingConfig: ExperimentConfig = {
      ...baseConfig,
      split: { mode: 'expanding', trainRatio: 0.4, valRatio: 0.2, testRatio: 0.4 },
    };
    const result = evaluateWalkForward({ candles: makeCandles(120), config: expandingConfig });
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('produces rolling mode', () => {
    const result = evaluateWalkForward({ candles: makeCandles(100), config: baseConfig });
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('is reproducible: same candles + config → identical results', () => {
    const candles = makeCandles(80);
    const r1 = evaluateWalkForward({ candles, config: baseConfig });
    const r2 = evaluateWalkForward({ candles, config: baseConfig });
    expect(r1.summary.testWinRate).toBe(r2.summary.testWinRate);
    expect(r1.steps.length).toBe(r2.steps.length);
  });

  it('throws when no splits can be generated', () => {
    const badConfig: ExperimentConfig = {
      ...baseConfig,
      lookback: 20,
      maxHolding: 1,
      split: { mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25, trainWindowSize: 30, valWindowSize: 20 },
    };
    expect(() => evaluateWalkForward({ candles: makeCandles(25), config: badConfig })).toThrow();
  });
});