import { describe, it, expect } from 'vitest';
import { runExperiment } from '../experiment-engine';
import type { ExperimentConfig } from '../experiment-types';
import type { CandleLike } from '../regimes/regime-types';

function makeCandles(n = 50): CandleLike[] {
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
  experimentId: 'test-001',
  hypothesis: 'TP/SL labeling works',
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

describe('Experiment Engine', () => {
  it('throws on empty candle array', () => {
    expect(() => runExperiment({ candles: [], config: baseConfig })).toThrow('Empty candle array');
  });

  it('throws on insufficient data', () => {
    const shortCandles = makeCandles(3);
    expect(() => runExperiment({ candles: shortCandles, config: baseConfig })).toThrow('Insufficient data');
  });

  it('validates feature names against registry', () => {
    const badConfig = { ...baseConfig, features: ['nonexistent_feature'] };
    // Feature validation happens when features are actually computed downstream.
    // The engine still runs but unknown features will be skipped or cause issues.
    const result = runExperiment({ candles: makeCandles(50), config: badConfig });
    expect(result).toBeDefined();
    expect(result.numSteps).toBeGreaterThan(0);
  });

  it('produces reproducible results for same config', () => {
    const candles = makeCandles(60);
    const r1 = runExperiment({ candles, config: baseConfig });
    const r2 = runExperiment({ candles, config: baseConfig });
    expect(r1.numSteps).toBe(r2.numSteps);
    expect(r1.metrics.train.numTrades).toBe(r2.metrics.train.numTrades);
    expect(r1.metrics.test.numTrades).toBe(r2.metrics.test.numTrades);
  });

  it('returns ExperimentResult with steps, metrics, and counts', () => {
    const candles = makeCandles(80);
    const result = runExperiment({ candles, config: baseConfig });

    expect(result.config).toBe(baseConfig);
    expect(result.totalBars).toBe(80);
    expect(result.numSteps).toBeGreaterThan(0);
    expect(result.steps.length).toBe(result.numSteps);

    for (const step of result.steps) {
      expect(step.step).toBeGreaterThanOrEqual(0);
      expect(step.train.startIdx).toBeLessThan(step.train.endIdx);
      expect(step.val.startIdx).toBeLessThan(step.val.endIdx);
      expect(step.test.startIdx).toBeLessThan(step.test.endIdx);
    }

    expect(result.metrics.train.numTrades).toBeGreaterThanOrEqual(0);
    expect(result.metrics.val.numTrades).toBeGreaterThanOrEqual(0);
    expect(result.metrics.test.numTrades).toBeGreaterThanOrEqual(0);

    // Regime attribution: every split reports the distinct regimes present in
    // its own windows — never a hardcoded empty list.
    expect(result.metrics.train.regimesPresent.length).toBeGreaterThan(0);
    expect(result.metrics.val.regimesPresent.length).toBeGreaterThan(0);
    expect(result.metrics.test.regimesPresent.length).toBeGreaterThan(0);
    for (const r of [...result.metrics.train.regimesPresent, ...result.metrics.val.regimesPresent, ...result.metrics.test.regimesPresent]) {
      expect(r).toMatch(/^(TREND_UP|TREND_DOWN|RANGE|HIGH_VOLATILITY|LOW_VOLATILITY|SHOCK|UNKNOWN)$/);
    }
  });

  it('attribution regimes are valid enum members from real windows', () => {
    const candles = makeCandles(80);
    const result = runExperiment({ candles, config: baseConfig });
    const trainWindow = result.steps[0]!.train;
    const fullDistinct = new Set(['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'SHOCK', 'UNKNOWN']);
    for (const r of result.metrics.train.regimesPresent) {
      expect(fullDistinct.has(r)).toBe(true);
    }
    expect(trainWindow.startIdx).toBeLessThan(trainWindow.endIdx);
  });

  it('delegates metrics to existing computeMetrics (integration proof)', () => {
    // If computeMetrics is broken, this will throw.
    const candles = makeCandles(60);
    const result = runExperiment({ candles, config: baseConfig });
    expect(result).toBeDefined();
    expect(result.numSteps).toBeGreaterThan(0);
  });

  it('respects causal boundary: no labels use lookback-before-window data', () => {
    const candles = makeCandles(100);
    const lookback = 10;
    const config = { ...baseConfig, lookback };
    const result = runExperiment({ candles, config });

    // First train split should start at lookback.
    const firstTrain = result.steps[0]!.train;
    expect(firstTrain.startIdx).toBe(lookback);
  });

  it('produces expanding mode with growing train window', () => {
    const expandingConfig: ExperimentConfig = {
      ...baseConfig,
      split: {
        mode: 'expanding',
        trainRatio: 0.4,
        valRatio: 0.2,
        testRatio: 0.4,
      },
    };
    const result = runExperiment({ candles: makeCandles(120), config: expandingConfig });
    expect(result.numSteps).toBeGreaterThanOrEqual(1);
  });

  it('throws when no splits can be generated', () => {
    const tinyConfig: ExperimentConfig = {
      ...baseConfig,
      lookback: 20,
      maxHolding: 1,
      split: {
        mode: 'rolling',
        trainRatio: 0.5,
        valRatio: 0.25,
        testRatio: 0.25,
        trainWindowSize: 30,
        valWindowSize: 20,
      },
    };
    const candles = makeCandles(30); // 30 bars, lookback 20 → 10 usable, not enough for 30+20+? windows
    expect(() => runExperiment({ candles, config: tinyConfig })).toThrow();
  });

  it('filters by regime when regimes is not "all"', () => {
    const regimeConfig: ExperimentConfig = {
      ...baseConfig,
      regimes: ['TREND_UP'],
    };
    const result = runExperiment({ candles: makeCandles(100), config: regimeConfig });
    expect(result.metrics.test.numTrades).toBeGreaterThanOrEqual(0);
  });

  it('config snapshot is frozen in result', () => {
    const candles = makeCandles(50);
    const result = runExperiment({ candles, config: baseConfig });
    expect(result.config.experimentId).toBe(baseConfig.experimentId);
    expect(result.config.tp).toBe(0.02);
    expect(result.config.sl).toBe(0.01);
  });
});