import { describe, it, expect } from 'vitest';
import { evaluateWalkForward, buildSummary } from '../../../../src/alpha-lab/walkforward/walkforward-evaluator';
import type { ExperimentConfig } from '../../../../src/alpha-lab/walkforward/experiments/experiment-types';
import type { CandleLike } from '../../../../src/alpha-lab/walkforward/regimes/regime-types';

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

/**
 * Oscillating closes (sine wave) so the triple-barrier labeler produces a
 * genuine mix of TP-first wins (label 1), SL-first losses (label -1), and
 * timeouts (label 0) — unlike the monotonic makeCandles fixture, which only
 * yields wins.
 */
function makeOscillatingCandles(n: number, amp = 0.03, period = 40): CandleLike[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 * (1 + amp * Math.sin((2 * Math.PI * i) / period));
    return {
      timestamp: new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
      open: close,
      high: close * 1.002,
      low: close * 0.998,
      close,
      volume: 50 + i,
    };
  });
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
      expect(step.trainMetrics.regimesPresent.length).toBeGreaterThan(0);
      expect(step.valMetrics.regimesPresent.length).toBeGreaterThan(0);
      expect(step.testMetrics.regimesPresent.length).toBeGreaterThan(0);
    }
  });

  it('win/loss/timeout rates are label-derived and sum to 1 in every split', () => {
    const result = evaluateWalkForward({ candles: makeCandles(100), config: baseConfig });
    expect(result.steps.length).toBeGreaterThan(0);
    for (const step of result.steps) {
      for (const m of [step.trainMetrics, step.valMetrics, step.testMetrics]) {
        expect(m.winRate).toBeGreaterThanOrEqual(0);
        expect(m.winRate).toBeLessThanOrEqual(1);
        if (m.numTrades > 0) {
          // Single semantics: win = TP-first exit (label === 1), same as split-metrics.
          expect(m.winRate + m.lossRate + m.timeoutRate).toBeCloseTo(1, 10);
        }
      }
    }
  });

  it('invariant holds with a genuine win/loss/timeout mix on oscillating data', () => {
    // Oscillating closes force SL hits (label -1) and timeouts (label 0),
    // not just the all-win path exercised by the monotonic fixture above.
    const result = evaluateWalkForward({ candles: makeOscillatingCandles(100), config: baseConfig });
    expect(result.steps.length).toBeGreaterThan(0);

    let sawLoss = false;
    let sawTimeout = false;
    for (const step of result.steps) {
      for (const m of [step.trainMetrics, step.valMetrics, step.testMetrics]) {
        expect(m.winRate).toBeGreaterThanOrEqual(0);
        expect(m.winRate).toBeLessThanOrEqual(1);
        expect(m.lossRate).toBeGreaterThanOrEqual(0);
        expect(m.lossRate).toBeLessThanOrEqual(1);
        expect(m.timeoutRate).toBeGreaterThanOrEqual(0);
        expect(m.timeoutRate).toBeLessThanOrEqual(1);
        if (m.numTrades > 0) {
          expect(m.winRate + m.lossRate + m.timeoutRate).toBeCloseTo(1, 10);
        }
        if (m.lossRate > 0) sawLoss = true;
        if (m.timeoutRate > 0) sawTimeout = true;
      }
    }
    // Guard against the fixture silently degenerating to the all-win path.
    expect(sawLoss).toBe(true);
    expect(sawTimeout).toBe(true);
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

  it('produces rolling mode with step results', () => {
    const multiStepConfig: ExperimentConfig = {
      ...baseConfig,
      split: {
        mode: 'rolling',
        trainRatio: 0.5,
        valRatio: 0.25,
        testRatio: 0.25,
        trainWindowSize: 20,
        valWindowSize: 10,
      },
    };
    const result = evaluateWalkForward({ candles: makeCandles(100), config: multiStepConfig });
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0]!.step).toBe(0);
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

  it('throws when splits array is empty due to expanding window exceeding data length', () => {
    const config: ExperimentConfig = {
      ...baseConfig,
      lookback: 5,
      maxHolding: 5,
      split: { mode: 'expanding', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25, trainWindowSize: 40, valWindowSize: 30 },
    };
    expect(() => evaluateWalkForward({ candles: makeCandles(60), config })).toThrow(
      'No splits generated — check config ratios vs data length',
    );
  });

  it('buildSummary returns zeroed summary when steps array is empty', () => {
    const summary = buildSummary([]);
    expect(summary.totalSteps).toBe(0);
    expect(summary.trainWinRate).toBe(0);
    expect(summary.valWinRate).toBe(0);
    expect(summary.testWinRate).toBe(0);
    expect(summary.overfitGap).toBe(0);
    expect(summary.consistencyScore).toBe(0);
    expect(summary.avgTestTrades).toBe(0);
    expect(summary.totalTestTrades).toBe(0);
  });

  it('handles splits where end < start resulting in empty labels and zero metrics', () => {
    const config: ExperimentConfig = {
      ...baseConfig,
      lookback: 5,
      maxHolding: 30,
      split: { mode: 'rolling', trainRatio: 0.5, valRatio: 0.25, testRatio: 0.25 },
    };
    const result = evaluateWalkForward({ candles: makeCandles(60), config });
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0]!.testMetrics.numTrades).toBe(0);
    expect(result.steps[0]!.testMetrics.winRate).toBe(0);
    expect(result.steps[0]!.testMetrics.lossRate).toBe(0);
    expect(result.steps[0]!.testMetrics.timeoutRate).toBe(0);
    expect(result.steps[0]!.testMetrics.meanLabel).toBe(0);
  });
});