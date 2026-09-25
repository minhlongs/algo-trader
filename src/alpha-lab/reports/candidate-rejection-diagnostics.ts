/**
 * Candidate Rejection Diagnostics
 *
 * Generates structured, deterministic rejection diagnostics and actionable
 * refinement hypotheses for candidate alphas that fail quantitative survival gates.
 */

import type { AlphaSurvivalGateResult } from '../attribution/alpha-survival-gate';
import type { WalkForwardSummary } from '../walkforward/walkforward-types';
import type { ExperimentConfig } from '../experiments/experiment-types';

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
    const value = gateResult.metrics.oosSharpeRatio;
    const threshold = gateResult.thresholds.minOosSharpeRatio;

    if (summary.testWinRate >= 0.5) {
      diagnostics.push({
        metric: 'oos_sharpe_ratio',
        value,
        threshold,
        reason: `OOS Sharpe ratio of ${value.toFixed(2)} is below hurdle rate ${threshold.toFixed(2)} despite win rate ${(summary.testWinRate * 100).toFixed(1)}%. Large losing trades drag down risk-adjusted return.`,
        refinementHypothesis: 'Stop-Loss Tightening',
        details: {
          recommendedParamChanges: {
            stopLossBps: config ? Math.round(config.sl * 10000 * 0.75) : 100,
          },
        },
      });
    } else if (summary.testProfitFactor < 1.3) {
      diagnostics.push({
        metric: 'oos_sharpe_ratio',
        value,
        threshold,
        reason: `OOS Sharpe ratio of ${value.toFixed(2)} is below hurdle rate ${threshold.toFixed(2)} with thin profit factor ${summary.testProfitFactor.toFixed(2)}. Edge is insufficient.`,
        refinementHypothesis: 'Profit Factor Improvement',
        details: {
          recommendedParamChanges: {
            takeProfitBps: config ? Math.round(config.tp * 10000 * 1.3) : 250,
          },
        },
      });
    } else {
      diagnostics.push({
        metric: 'oos_sharpe_ratio',
        value,
        threshold,
        reason: `OOS Sharpe ratio of ${value.toFixed(2)} is below hurdle rate ${threshold.toFixed(2)} with low win rate ${(summary.testWinRate * 100).toFixed(1)}%.`,
        refinementHypothesis: 'Signal Conviction Threshold',
        details: {
          recommendedParamChanges: {
            breakoutLookback: config ? config.lookback + 5 : 25,
          },
        },
      });
    }
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

  // 4. Conservative Cost Stress Failure (20 bps)
  if (!gateResult.checks.costStressConservativePassed) {
    const value = gateResult.metrics.conservativeStressPnl;
    const threshold = 0.0;
    diagnostics.push({
      metric: 'cost_stress_conservative',
      value,
      threshold,
      reason: `Net PnL collapses to ${value.toFixed(4)} under CONSERVATIVE cost stress (${gateResult.thresholds.conservativeFrictionBps} bps friction). Strategy is a fee trap.`,
      refinementHypothesis: 'Trade Frequency Reduction',
      details: {
        recommendedParamChanges: {
          breakoutLookback: config ? config.lookback + 10 : 30,
        },
      },
    });
  }

  // 5. Adverse Cost Stress Failure (50 bps)
  if (!gateResult.checks.costStressAdversePassed) {
    const value = gateResult.metrics.adverseStressPnl;
    const threshold = 0.0;
    diagnostics.push({
      metric: 'cost_stress_adverse',
      value,
      threshold,
      reason: `Net PnL collapses to ${value.toFixed(4)} under ADVERSE cost stress (${gateResult.thresholds.adverseFrictionBps} bps friction). Insufficient margin for adverse execution conditions.`,
      refinementHypothesis: 'Execution Hurdle & Volatility Filter',
      details: {
        suggestedFeatures: ['ATR', 'realizedVol'],
      },
    });
  }

  return diagnostics;
}
