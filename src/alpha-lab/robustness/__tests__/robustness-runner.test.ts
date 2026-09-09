/**
 * Robustness Runner Tests — Phase 14
 */

import { describe, it, expect } from 'vitest';
import {
  runRobustnessTest,
  runFeeStress,
  runDelayStress,
  DEFAULT_SHARPE_STABILITY_THRESHOLD,
} from '../robustness-runner';
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

  it('skips non-numeric parameters and invalid perturbations gracefully', () => {
    const result = runRobustnessTest(robustnessConfig({
      parameterPerturbation: {
        enabled: true,
        ranges: [-1.0, 0.1],
        paramsToPerturb: ['symbol', 'tp'],
      },
    }));
    expect(result.parameterPerturbation.length).toBe(1);
    expect(result.parameterPerturbation[0]!.paramName).toBe('tp');
    expect(result.parameterPerturbation[0]!.perturbation).toBe(0.1);
  });

  it('handles fee stress errors gracefully', () => {
    const results = runFeeStress(baseConfig(), [], { enabled: true, multipliers: [1, 2] }, 1.0);
    expect(results).toEqual([]);
  });

  it('handles delay stress errors when delayed bars exceed data', () => {
    const candles = Array.from({ length: 25 }, (_, i) => ({
      timestamp: `t${i}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 10,
    }));
    const results = runDelayStress(baseConfig(), candles, { enabled: true, maxDelayBars: 20 }, 1.0);
    expect(results).toEqual([]);
  });

  it('handles missing data stress when all candles are dropped', () => {
    const result = runRobustnessTest(robustnessConfig({
      missingDataStress: { enabled: true, dropPercentages: [1.0], seed: 42 },
    }));
    expect(result.missingDataStress).toEqual([]);
  });

  it('returns overallScore 0 when baseline Sharpe is 0 and perturbations exist', () => {
    const zeroSharpeConfig = baseConfig({ maxHolding: 190, lookback: 10 });
    const result = runRobustnessTest({
      experimentId: 'zero-sharpe',
      baseConfig: zeroSharpeConfig,
      feeStress: { enabled: true, multipliers: [1.5] },
    });
    expect(result.baselineMetrics.sharpeRatio).toBe(0);
    expect(result.overallScore).toBe(0);
  });

  it('exports DEFAULT_SHARPE_STABILITY_THRESHOLD constant', () => {
    expect(DEFAULT_SHARPE_STABILITY_THRESHOLD).toBe(0.5);
  });
});