/**
 * Alpha Evaluator
 *
 * Compares candidate strategy results against baseline benchmarks.
 * Produces a structured verdict: PASS (candidate beats all baselines) or FAIL.
 *
 * Survival criteria (configurable):
 * - Net PnL > Buy & Hold net PnL (absolute alpha)
 * - Win rate > 0.5 (basic edge)
 * - Net PnL > Random Entry median PnL (beats randomness)
 * - Sharpe > 0 (risk-adjusted return)
 */

import { runAllBaselines } from '../baselines/baseline-runner';
import type { CandleLike } from '../regimes/regime-types';

export interface SurvivalCriteria {
  /** Candidate must beat buy-hold net PnL (default: true). */
  beatBuyHold: boolean;
  /** Candidate win rate must exceed this threshold (default: 0.5). */
  minWinRate: number;
  /** Candidate must beat random entry PnL (default: true). */
  beatRandom: boolean;
  /** Candidate Sharpe must exceed this (default: 0). */
  minSharpe: number;
}

export const DEFAULT_CRITERIA: SurvivalCriteria = {
  beatBuyHold: true,
  minWinRate: 0.5,
  beatRandom: true,
  minSharpe: 0,
};

export interface CandidateResult {
  name: string;
  totalNetPnl: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  profitFactor: number;
  maxDrawdown: number;
}

export interface BaselineComparison {
  baseline: string;
  candidatePnl: number;
  baselinePnl: number;
  delta: number;
  beats: boolean;
}

export interface AlphaVerdict {
  /** Overall pass/fail. */
  passed: boolean;
  /** Which criteria failed (empty if passed). */
  failedCriteria: string[];
  /** Per-baseline comparison. */
  comparisons: BaselineComparison[];
  /** Recommendation text. */
  recommendation: string;
}

/**
 * Run all baselines and compare a candidate against them.
 *
 * @param candidate — candidate result (from experiment evaluator)
 * @param candles — OHLCV data for baseline computation
 * @param criteria — optional custom survival criteria
 */
export function evaluateAlpha(
  candidate: CandidateResult,
  candles: Array<{ timestamp: string; close: number }>,
  criteria: Partial<SurvivalCriteria> = {},
): AlphaVerdict {
  const rules = { ...DEFAULT_CRITERIA, ...criteria };
  const baselines = runAllBaselines(candles as CandleLike[]);

  const comparisons: BaselineComparison[] = baselines.map((b) => ({
    baseline: b.name,
    candidatePnl: candidate.totalNetPnl,
    baselinePnl: b.report.totalPnl,
    delta: candidate.totalNetPnl - b.report.totalPnl,
    beats: candidate.totalNetPnl > b.report.totalPnl,
  }));

  const failures: string[] = [];

  if (rules.beatBuyHold) {
    const bh = baselines.find((b) => b.name === 'buy-and-hold');
    if (bh && candidate.totalNetPnl <= bh.report.totalPnl) {
      failures.push('candidate did not beat buy-and-hold net PnL');
    }
  }

  if (rules.beatRandom) {
    const rand = baselines.find((b) => b.name === 'random-entry');
    if (rand && candidate.totalNetPnl <= rand.report.totalPnl) {
      failures.push('candidate did not beat random entry PnL');
    }
  }

  if (candidate.winRate < rules.minWinRate) {
    failures.push(`win rate ${candidate.winRate.toFixed(3)} below threshold ${rules.minWinRate}`);
  }

  if (candidate.sharpeRatio < rules.minSharpe) {
    failures.push(`Sharpe ${candidate.sharpeRatio.toFixed(3)} below threshold ${rules.minSharpe}`);
  }

  const passed = failures.length === 0;
  return {
    passed,
    failedCriteria: failures,
    comparisons,
    recommendation: passed
      ? 'Candidate passes survival gate. Proceed to walk-forward validation.'
      : `Candidate fails: ${failures.join('; ')}. Revise strategy before deployment.`,
  };
}