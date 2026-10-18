/**
 * Candidate Rejection Diagnostics
 *
 * Generates structured, deterministic rejection diagnostics and actionable
 * refinement hypotheses for candidate alphas that fail quantitative survival gates.
 */

import type { AlphaSurvivalGateResult } from '../attribution/alpha-survival-gate';
import type { WalkForwardSummary } from '../walkforward/walkforward-types';
import type { ExperimentConfig } from '../experiments/experiment-types';
import {
  buildSharpeRejectionDiagnostic,
  buildCostStressDiagnostics,
} from './candidate-rejection-rules';

export { buildSharpeRejectionDiagnostic, buildCostStressDiagnostics };

export interface CandidateRejectionDiagnostic {
  /** Identifier of the failed metric. */
  metric: string;
  /** Observed numeric value. */
  value: number;
  /** Gate hurdle / threshold required for passing. */
  threshold: number;
  /** Unambiguous, human-readable reason explaining the failure. */
  reason: string;
  /** Actionable hypothesis for refinement in subsequent discovery loops. */
  refinementHypothesis: string;
  /** Optional rich hypothesis details. */
  details?: {
    recommendedParamChanges?: Record<string, number | string>;
    suggestedFeatures?: string[];
    suggestedRegimeFilter?: string[];
  };
}

/**
 * Generate structured rejection diagnostics for a failing candidate alpha.
 */
export function generateCandidateRejectionDiagnostics(
  gateResult: AlphaSurvivalGateResult,
  summary: WalkForwardSummary,
  config?: ExperimentConfig,
): CandidateRejectionDiagnostic[] {
  if (gateResult.passed) {
    return [];
  }

  const diagnostics: CandidateRejectionDiagnostic[] = [];

  // 1. OOS Sharpe Ratio Failure
  if (!gateResult.checks.sharpePassed) {
    diagnostics.push(buildSharpeRejectionDiagnostic(gateResult, summary, config));
  }

  // 2. Max Drawdown Failure
  if (!gateResult.checks.drawdownPassed) {
    const value = gateResult.metrics.maxDrawdown;
    const threshold = gateResult.thresholds.maxDrawdown;
    diagnostics.push({
      metric: 'max_drawdown',
      value,
      threshold,
      reason: `Out-of-sample max drawdown of ${(value * 100).toFixed(1)}% exceeds allowable ceiling of ${(threshold * 100).toFixed(1)}%.`,
      refinementHypothesis: 'Drawdown Reduction',
      details: {
        recommendedParamChanges: {
          maxHoldBars: config ? Math.max(6, Math.round(config.maxHolding * 0.7)) : 12,
        },
      },
    });
  }

  // 3. Regime Consistency Failure
  if (!gateResult.checks.regimeConsistencyPassed) {
    const value = gateResult.metrics.regimeConsistencyScore;
    const threshold = gateResult.thresholds.minRegimeConsistencyScore;
    diagnostics.push({
      metric: 'regime_consistency_score',
      value,
      threshold,
      reason: `Regime consistency score of ${value.toFixed(2)} is below minimum ${threshold.toFixed(2)}. Performance is erratic across market regimes.`,
      refinementHypothesis: 'Regime Filter',
      details: {
        suggestedRegimeFilter: ['TREND_UP'],
      },
    });
  }

  // 4 & 5. Conservative & Adverse Cost Stress Failures
  diagnostics.push(...buildCostStressDiagnostics(gateResult, config));

  return diagnostics;
}
