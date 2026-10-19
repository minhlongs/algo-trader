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
} from './robustness-types';
import { generateMockCandles } from '../experiments/mock-candles';
import { dropCandles, delayCandles } from './candle-perturbers';
import {
  getTestMetrics,
  runParameterPerturbation,
  runFeeStress,
  runDelayStress,
  runMissingDataStress,
} from './robustness-perturbation-runners';

export {
  dropCandles,
  delayCandles,
  DEFAULT_SHARPE_STABILITY_THRESHOLD,
  runParameterPerturbation,
  runFeeStress,
  runDelayStress,
  runMissingDataStress,
};

/** Count perturbations whose Sharpe stays within the stability threshold. */
function countStable(deltas: number[], baselineSharpe: number, threshold: number): number {
  if (baselineSharpe === 0) return 0;
  const bound = Math.abs(baselineSharpe) * threshold;
  return deltas.filter((d) => Math.abs(d) <= bound).length;
}

export function runRobustnessTest(config: RobustnessConfig): RobustnessResult {
  const { baseConfig, parameterPerturbation, feeStress, delayStress, missingDataStress } = config;

  const candleCount = Math.max(baseConfig.lookback + baseConfig.maxHolding + 10, 200);
  const candles = generateMockCandles(baseConfig.symbol, candleCount, baseConfig.seed);

  const baselineMetrics = getTestMetrics(baseConfig, candles);

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
