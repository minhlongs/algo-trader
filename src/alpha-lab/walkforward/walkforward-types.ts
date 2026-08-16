/**
 * Walk-Forward Validation Types
 *
 * Per-step and summary result types for the walk-forward evaluation engine.
 */

import type { SplitMetrics } from '../experiments/experiment-types';

// ── Per-Step Result ──────────────────────────────────────────────────────────

export interface StepResult {
  /** Walk-forward step index (0-based). */
  step: number;
  /** Train split metrics for this step. */
  trainMetrics: SplitMetrics;
  /** Validation split metrics for this step. */
  valMetrics: SplitMetrics;
  /** Test (out-of-sample) metrics for this step. */
  testMetrics: SplitMetrics;
}

// ── Summary Result ───────────────────────────────────────────────────────────

export interface WalkForwardSummary {
  /** Total number of walk-forward steps. */
  totalSteps: number;
  /** Mean win rate across all train splits. */
  trainWinRate: number;
  /** Mean win rate across all validation splits. */
  valWinRate: number;
  /** Mean win rate across all out-of-sample test splits. */
  testWinRate: number;
  /** Average overfit gap (trainWinRate - testWinRate). Positive = potential overfit. */
  overfitGap: number;
  /** Fraction of test splits where win rate > 0.5. */
  consistencyScore: number;
  /** Average number of test trades per step. */
  avgTestTrades: number;
  /** Total trades across all test splits. */
  totalTestTrades: number;
}

// ── Walk-Forward Result ───────────────────────────────────────────────────────

export interface WalkForwardResult {
  /** Per-step breakdown. */
  steps: StepResult[];
  /** Aggregated summary. */
  summary: WalkForwardSummary;
}