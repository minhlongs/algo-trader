/**
 * Candidate Rejection Diagnostic Rule Builders
 * Pure per-gate diagnostic classification helpers for failing candidate alphas.
 */

import type { AlphaSurvivalGateResult } from '../attribution/alpha-survival-gate';
import type { WalkForwardSummary } from '../walkforward/walkforward-types';
import type { ExperimentConfig } from '../experiments/experiment-types';
import type { CandidateRejectionDiagnostic } from './candidate-rejection-diagnostics';

export function buildSharpeRejectionDiagnostic(
  gateResult: AlphaSurvivalGateResult,
  summary: WalkForwardSummary,
  config?: ExperimentConfig,
): CandidateRejectionDiagnostic {
  const value = gateResult.metrics.oosSharpeRatio;
  const threshold = gateResult.thresholds.minOosSharpeRatio;

  if (summary.testWinRate >= 0.5) {
    return {
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
    };
  }
  if (summary.testProfitFactor < 1.3) {
    return {
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
    };
  }
  return {
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
  };
}

export function buildCostStressDiagnostics(
  gateResult: AlphaSurvivalGateResult,
  config?: ExperimentConfig,
): CandidateRejectionDiagnostic[] {
  const out: CandidateRejectionDiagnostic[] = [];

  if (!gateResult.checks.costStressConservativePassed) {
    const value = gateResult.metrics.conservativeStressPnl;
    out.push({
      metric: 'cost_stress_conservative',
      value,
      threshold: 0.0,
      reason: `Net PnL collapses to ${value.toFixed(4)} under CONSERVATIVE cost stress (${gateResult.thresholds.conservativeFrictionBps} bps friction). Strategy is a fee trap.`,
      refinementHypothesis: 'Trade Frequency Reduction',
      details: {
        recommendedParamChanges: {
          breakoutLookback: config ? config.lookback + 10 : 30,
        },
      },
    });
  }

  if (!gateResult.checks.costStressAdversePassed) {
    const value = gateResult.metrics.adverseStressPnl;
    out.push({
      metric: 'cost_stress_adverse',
      value,
      threshold: 0.0,
      reason: `Net PnL collapses to ${value.toFixed(4)} under ADVERSE cost stress (${gateResult.thresholds.adverseFrictionBps} bps friction). Insufficient margin for adverse execution conditions.`,
      refinementHypothesis: 'Execution Hurdle & Volatility Filter',
      details: {
        suggestedFeatures: ['ATR', 'realizedVol'],
      },
    });
  }

  return out;
}
