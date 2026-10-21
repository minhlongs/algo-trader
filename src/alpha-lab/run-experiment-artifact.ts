/**
 * Experiment Artifact Assembly
 *
 * Shape of the JSON artifact the experiment CLI prints to stdout, plus the
 * pure assembly step that folds an experiment result into it. Extracted from
 * the CLI runner so the output contract lives beside its own type.
 */

import type { ExperimentResult } from './experiments/experiment-types';
import { pickMetrics, mapBaselines } from './run-experiment-helpers';
import type { BaselineRun } from './baselines/baseline-runner';
import type { MarketRegime } from './regimes/regime-types';

/** Standard experiment CLI output artifact. */
export interface ExperimentArtifact {
  experimentId: string;
  symbol: string;
  timeframe: string;
  dataSource: string;
  totalBars: number;
  numSteps: number;
  metrics: {
    train: ReturnType<typeof pickMetrics>;
    val: ReturnType<typeof pickMetrics>;
    test: ReturnType<typeof pickMetrics>;
  };
  baselines: ReturnType<typeof mapBaselines>;
  suggestedNext?: string[];
}

/**
 * Minimum candle count that keeps every split non-empty. Ratios sum to < 1, so
 * the worst case needs at least `1 / (1 - sum)` bars per split; the +0.01 slack
 * absorbs rounding. Floors at 500 for stable indicators.
 */
export function requiredCandleCount(ratios: {
  trainRatio: number;
  valRatio: number;
  testRatio: number;
}): number {
  const minBars = Math.ceil((1 / (1 - ratios.trainRatio - ratios.valRatio - ratios.testRatio + 0.01)) * 100);
  return Math.max(500, minBars * 3);
}

/** Fold a completed experiment result into the stdout artifact. */
export function buildArtifact(
  result: ExperimentResult,
  source: string,
  baselines: BaselineRun[],
  regimeSeries: MarketRegime[],
  suggestedNext?: string[],
): ExperimentArtifact {
  return {
    experimentId: result.config.experimentId,
    symbol: result.config.symbol,
    timeframe: result.config.timeframe,
    dataSource: source,
    totalBars: result.totalBars,
    numSteps: result.numSteps,
    metrics: {
      train: pickMetrics(result.metrics.train),
      val: pickMetrics(result.metrics.val),
      test: pickMetrics(result.metrics.test),
    },
    baselines: mapBaselines(baselines, regimeSeries),
    ...(suggestedNext ? { suggestedNext } : {}),
  };
}

/**
 * Rank top family ids from ledger suggestions, excluding already-demoted ones.
 */
export function topSuggestedFamilies(
  suggestions: Array<{ familyId: string; reason: string }>,
  limit = 5,
): string[] {
  return suggestions
    .filter((s) => s.reason !== 'passed-demoted')
    .slice(0, limit)
    .map((s) => s.familyId);
}
