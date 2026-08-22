/**
 * Robustness Test Types — Phase 14
 *
 * Types for stress-testing experiment configs across perturbation dimensions.
 */

import type { ExperimentConfig, SplitMetrics } from '../experiments/experiment-types';

// ── Robustness Config ────────────────────────────────────────────────────────

export interface ParameterPerturbationConfig {
  enabled: boolean;
  /** Relative deltas to apply, e.g. [-0.3, -0.2, -0.1, 0.1, 0.2, 0.3] */
  ranges: number[];
  /** Parameter names from ExperimentConfig to perturb */
  paramsToPerturb: string[];
}

export interface FeeStressConfig {
  enabled: boolean;
  /** Multipliers on the base feeBps, e.g. [1, 2, 3, 4] */
  multipliers: number[];
}

export interface DelayStressConfig {
  enabled: boolean;
  /** Max number of bars to delay entry signals */
  maxDelayBars: number;
}

export interface MissingDataStressConfig {
  enabled: boolean;
  /** Fractions of candles to drop, e.g. [0.05, 0.1, 0.2] */
  dropPercentages: number[];
  seed: number;
}

export interface RobustnessConfig {
  experimentId: string;
  baseConfig: ExperimentConfig;
  parameterPerturbation?: ParameterPerturbationConfig;
  feeStress?: FeeStressConfig;
  delayStress?: DelayStressConfig;
  missingDataStress?: MissingDataStressConfig;
}

// ── Robustness Results ───────────────────────────────────────────────────────

export interface PerturbationResult {
  paramName: string;
  perturbation: number;
  metrics: SplitMetrics;
  sharpeRatioDelta: number;
}

export interface FeeStressResult {
  multiplier: number;
  feeBps: number;
  metrics: SplitMetrics;
  sharpeRatioDelta: number;
}

export interface DelayStressResult {
  delayBars: number;
  metrics: SplitMetrics;
  sharpeRatioDelta: number;
}

export interface MissingDataResult {
  dropPercentage: number;
  metrics: SplitMetrics;
  sharpeRatioDelta: number;
}

export interface RobustnessResult {
  experimentId: string;
  baselineMetrics: SplitMetrics;
  parameterPerturbation: PerturbationResult[];
  feeStress: FeeStressResult[];
  delayStress: DelayStressResult[];
  missingDataStress: MissingDataResult[];
  /** 0–1 score: fraction of perturbations within acceptable Sharpe bounds */
  overallScore: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Threshold: Sharpe must stay within this fraction of baseline to count as stable. */
export const DEFAULT_SHARPE_STABILITY_THRESHOLD = 0.5;