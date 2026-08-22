/**
 * Robustness Runner Tests — Phase 14
 */

import { describe, it, expect } from 'vitest';
import { runRobustnessTest, dropCandles, delayCandles } from '../robustness-runner';
import type { RobustnessConfig } from '../robustness-types';
import type { ExperimentConfig } from '../../experiments/experiment-types';

// ── Minimal valid config ─────────────────────────────────────────────────────

function baseConfig(overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  return {
    experimentId: 'test-exp',
    hypothesis: 'Test hypothesis',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    features: ['returns'],
    regimes: 'all',
    tp: 0.02,
    sl: 0.01,
    maxHolding: 10,
    lookback: 20,
    split: { mode: 'expanding', trainRatio: 0.6, valRatio: 0.2, testRatio: 0.2 },
    cost: { feeBps: 5, slippageBps: 2, scenario: 'normal' },
    seed: 42,
    gitCommit: 'test',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function robustnessConfig(overrides: Partial<RobustnessConfig> = {}): RobustnessConfig {
  return {
    experimentId: 'test-exp',
    baseConfig: baseConfig(),
    ...overrides,
  };
}

// ── Candle helpers ───────────────────────────────────────────────────────────

describe('dropCandles', () => {
  it('returns same array when fraction is 0', () => {
    const candles = [{ timestamp: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    expect(dropCandles(candles, 0, 42)).toEqual(candles);
  });

  it('reduces length when fraction > 0', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 1,
    }));
    const result = dropCandles(candles, 0.2, 42);
    expect(result.length).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(50);
  });

  it('preserves order', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: `t${i}`, open: i, high: i, low: i, close: i, volume: 1,
    }));
    const result = dropCandles(candles, 0.3, 42);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].open).toBeGreaterThan(result[i - 1].open);
    }
  });

  it('is deterministic for same seed', () => {
    const candles = Array.from({ length: 100 }, (_, i) => ({
      timestamp: `t${i}`, open: 1, high: 1, low: 1, close: 1, volume: 1,
    }));
    const a = dropCandles(candles, 0.2, 42);
    const b = dropCandles(candles, 0.2, 42);
    expect(a.length).toBe(b.length);
  });
});

describe('delayCandles', () => {
  it('removes first N candles', () => {
    const candles = Array.from({ length: 50 }, (_, i) => ({
      timestamp: `t${i}`, open: i, high: i, low: i, close: i, volume: 1,
    }));
    const result = delayCandles(candles, 5);
    expect(result.length).toBe(45);
    expect(result[0].open).toBe(5);
  });

  it('returns same array when delay is 0', () => {
    const candles = [{ timestamp: 'a', open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    expect(delayCandles(candles, 0)).toEqual(candles);
  });
});

// ── Full robustness runner ───────────────────────────────────────────────────

describe('runRobustnessTest', () => {
  it('returns baseline metrics', () => {
    const result = runRobustnessTest(robustnessConfig());
    expect(result.experimentId).toBe('test-exp');
    expect(result.baselineMetrics).toBeDefined();
    expect(result.baselineMetrics.numTrades).toBeGreaterThanOrEqual(0);
  });

  it('skips disabled test types', () => {
    const result = runRobustnessTest(robustnessConfig());
    expect(result.parameterPerturbation).toEqual([]);
    expect(result.feeStress).toEqual([]);
    expect(result.delayStress).toEqual([]);
    expect(result.missingDataStress).toEqual([]);
    expect(result.overallScore).toBe(1.0);
  });

  it('runs parameter perturbation when enabled', () => {
    const result = runRobustnessTest(robustnessConfig({
      parameterPerturbation: {
        enabled: true,
        ranges: [-0.1, 0.1],
        paramsToPerturb: ['tp', 'sl'],
      },
    }));
    expect(result.parameterPerturbation.length).toBeGreaterThan(0);
  });

  it('runs fee stress when enabled', () => {
    const result = runRobustnessTest(robustnessConfig({
      feeStress: { enabled: true, multipliers: [1, 2, 3] },
    }));
    expect(result.feeStress.length).toBe(3);
    expect(result.feeStress[0].multiplier).toBe(1);
    expect(result.feeStress[2].multiplier).toBe(3);
  });

  it('runs delay stress when enabled', () => {
    const result = runRobustnessTest(robustnessConfig({
      delayStress: { enabled: true, maxDelayBars: 3 },
    }));
    expect(result.delayStress.length).toBeGreaterThan(0);
    expect(result.delayStress.length).toBeLessThanOrEqual(3);
  });

  it('runs missing data stress when enabled', () => {
    const result = runRobustnessTest(robustnessConfig({
      missingDataStress: { enabled: true, dropPercentages: [0.05, 0.1], seed: 42 },
    }));
    expect(result.missingDataStress.length).toBe(2);
    expect(result.missingDataStress[0].dropPercentage).toBe(0.05);
  });

  it('overall score is between 0 and 1', () => {
    const result = runRobustnessTest(robustnessConfig({
      parameterPerturbation: {
        enabled: true,
        ranges: [-0.2, -0.1, 0.1, 0.2],
        paramsToPerturb: ['tp'],
      },
    }));
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it('deterministic: same config → same results', () => {
    const config = robustnessConfig({
      feeStress: { enabled: true, multipliers: [1, 2] },
    });
    const a = runRobustnessTest(config);
    const b = runRobustnessTest(config);
    expect(a.baselineMetrics.sharpeRatio).toBe(b.baselineMetrics.sharpeRatio);
    expect(a.overallScore).toBe(b.overallScore);
  });
});