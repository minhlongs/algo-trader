/**
 * Robustness Perturbation Runners — Phase 14
 *
 * Individual perturbation runners for:
 *   - parameter perturbation (±10%, ±20%, ±30%)
 *   - fee stress (1x–4x)
 *   - delayed execution (1–N bars)
 *   - missing data (5%–20% drop)
 */

import {
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
import { dropCandles, delayCandles } from './candle-perturbers';

export function getTestMetrics(config: ExperimentConfig, candles: CandleLike[]): SplitMetrics {
  const result = runExperiment({ candles, config });
  return result.metrics.test;
}

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
