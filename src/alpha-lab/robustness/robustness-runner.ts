/**
 * Robustness Runner — Phase 14
 *
 * Stress-tests experiment configs across perturbation dimensions:
 *   - parameter perturbation (±10%, ±20%, ±30%)
 *   - fee stress (1x–4x)
 *   - delayed execution (1–N bars)
 *   - missing data (5%–20% drop)
 *
 * All runs are deterministic (seeded) and research-only.
 */

import {
  DEFAULT_SHARPE_STABILITY_THRESHOLD,
  type RobustnessConfig,
  type RobustnessResult,
  type PerturbationResult,
  type FeeStressResult,
  type DelayStressResult,
  type MissingDataResult,
  type ParameterPerturbationConfig,
  type FeeStressConfig,
  type DelayStressConfig,
  type MissingDataStressConfig,
} from './robustness-types';
import type { ExperimentConfig, SplitMetrics } from '../experiments/experiment-types';
import type { CandleLike } from '../regimes/regime-types';
import { runExperiment } from '../experiments/experiment-engine';
import { generateMockCandles } from '../experiments/mock-candles';
import { dropCandles, delayCandles } from './candle-perturbers';
export { dropCandles, delayCandles, DEFAULT_SHARPE_STABILITY_THRESHOLD };

// ── Metric helpers ───────────────────────────────────────────────────────────

function getTestMetrics(config: ExperimentConfig, candles: CandleLike[]): SplitMetrics {
  const result = runExperiment({ candles, config });
  return result.metrics.test;
}

// ── Perturbation runners ─────────────────────────────────────────────────────

export function runParameterPerturbation(
  config: ExperimentConfig,
  candles: CandleLike[],
  pconfig: ParameterPerturbationConfig,
  baselineSharpe: number,
): PerturbationResult[] {
  const results: PerturbationResult[] = [];
  for (const paramName of pconfig.paramsToPerturb) {
    const baseValue = (config as unknown as Record<string, unknown>)[paramName];
    if (typeof baseValue !== 'number') continue;
    for (const delta of pconfig.ranges) {
      const perturbed = baseValue * (1 + delta);
      const perturbedConfig: ExperimentConfig = { ...config, [paramName]: perturbed };
      try {
        const metrics = getTestMetrics(perturbedConfig, candles);
        results.push({
          paramName,
          perturbation: delta,
          metrics,
          sharpeRatioDelta: metrics.sharpeRatio - baselineSharpe,
        });
      } catch {
        // Skip perturbations that produce invalid configs
      }
    }
  }
  return results;
}

export function runFeeStress(
  config: ExperimentConfig,
  candles: CandleLike[],
  fconfig: FeeStressConfig,
  baselineSharpe: number,
): FeeStressResult[] {
  const results: FeeStressResult[] = [];
  for (const multiplier of fconfig.multipliers) {
    const perturbedConfig: ExperimentConfig = {
      ...config,
      cost: { ...config.cost, feeBps: config.cost.feeBps * multiplier },
    };
    try {
      const metrics = getTestMetrics(perturbedConfig, candles);
      results.push({
        multiplier,
        feeBps: perturbedConfig.cost.feeBps,
        metrics,
        sharpeRatioDelta: metrics.sharpeRatio - baselineSharpe,
      });
    } catch {
      // Skip multipliers that produce invalid configs
    }
  }
  return results;
}

export function runDelayStress(
  config: ExperimentConfig,
  candles: CandleLike[],
  dconfig: DelayStressConfig,
  baselineSharpe: number,
): DelayStressResult[] {
  const results: DelayStressResult[] = [];
  for (let delayBars = 1; delayBars <= dconfig.maxDelayBars; delayBars++) {
    const delayedCandles = delayCandles(candles, delayBars);
    try {
      const metrics = getTestMetrics(config, delayedCandles);
      results.push({
        delayBars,
        metrics,
        sharpeRatioDelta: metrics.sharpeRatio - baselineSharpe,
      });
    } catch {
      // Skip delays that produce insufficient data
    }
  }
  return results;
}

export function runMissingDataStress(
  config: ExperimentConfig,
  candles: CandleLike[],
  mconfig: MissingDataStressConfig,
  baselineSharpe: number,
): MissingDataResult[] {
  const results: MissingDataResult[] = [];
  for (const dropFraction of mconfig.dropPercentages) {
    const droppedCandles = dropCandles(candles, dropFraction, mconfig.seed);
    try {
      const metrics = getTestMetrics(config, droppedCandles);
      results.push({
        dropPercentage: dropFraction,
        metrics,
        sharpeRatioDelta: metrics.sharpeRatio - baselineSharpe,
      });
    } catch {
      // Skip drops that produce insufficient data
    }
  }
  return results;
}

// ── Overall runner ───────────────────────────────────────────────────────────

/** Count perturbations whose Sharpe stays within the stability threshold. */
function countStable(deltas: number[], baselineSharpe: number, threshold: number): number {
  if (baselineSharpe === 0) return 0;
  const bound = Math.abs(baselineSharpe) * threshold;
  return deltas.filter((d) => Math.abs(d) <= bound).length;
}

export function runRobustnessTest(config: RobustnessConfig): RobustnessResult {
  const { baseConfig, parameterPerturbation, feeStress, delayStress, missingDataStress } = config;

  // Generate candles for testing (deterministic)
  const candleCount = Math.max(baseConfig.lookback + baseConfig.maxHolding + 10, 200);
  const candles = generateMockCandles(baseConfig.symbol, candleCount, baseConfig.seed);

  // Baseline
  const baselineMetrics = getTestMetrics(baseConfig, candles);

  // Run each enabled stress dimension
  const paramResults = parameterPerturbation?.enabled
    ? runParameterPerturbation(baseConfig, candles, parameterPerturbation, baselineMetrics.sharpeRatio)
    : [];
  const feeResults = feeStress?.enabled
    ? runFeeStress(baseConfig, candles, feeStress, baselineMetrics.sharpeRatio)
    : [];
  const delayResults = delayStress?.enabled
    ? runDelayStress(baseConfig, candles, delayStress, baselineMetrics.sharpeRatio)
    : [];
  const missingResults = missingDataStress?.enabled
    ? runMissingDataStress(baseConfig, candles, missingDataStress, baselineMetrics.sharpeRatio)
    : [];

  // Overall score: fraction of perturbations within stability bounds.
  // Includes fee stress deltas (H4 fix) so fee collapse is reflected in the score.
  const allDeltas = [
    ...paramResults.map((r) => r.sharpeRatioDelta),
    ...feeResults.map((r) => r.sharpeRatioDelta),
    ...delayResults.map((r) => r.sharpeRatioDelta),
    ...missingResults.map((r) => r.sharpeRatioDelta),
  ];
  const total = allDeltas.length;
  const stable = total > 0
    ? countStable(allDeltas, baselineMetrics.sharpeRatio, DEFAULT_SHARPE_STABILITY_THRESHOLD)
    : 1.0;
  const overallScore = total > 0 ? stable / total : 1.0;

  return {
    experimentId: config.experimentId,
    baselineMetrics,
    parameterPerturbation: paramResults,
    feeStress: feeResults,
    delayStress: delayResults,
    missingDataStress: missingResults,
    overallScore,
  };
}