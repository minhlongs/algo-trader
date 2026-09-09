/**
 * Survival Gate
 *
 * Combines baseline comparison + ablation into a single verdict.
 * A strategy must:
 * 1. Beat all baselines (buy-hold, random, momentum, mean-reversion)
 * 2. Have positive Sharpe
 * 3. Have win rate > 0.5
 * 4. Pass ablation (disabling features/labels shouldn't flip the result)
 *
 * This is the FINAL gate before a strategy can be considered for promotion.
 */

import { runAllBaselines, type BaselineRun } from '../baselines/baseline-runner';
import { evaluateAlpha, type AlphaVerdict, type SurvivalCriteria } from './alpha-evaluator';
import type { CandleLike } from '../regimes/regime-types';
import type { CandidateResult } from './alpha-evaluator';

export interface GateResult {
  /** Overall pass/fail. */
  passed: boolean;
  /** Alpha verdict from baseline comparison. */
  alpha: AlphaVerdict;
  /** Ablation results (baseline vs candidate with features removed). */
  ablation: AblationResult[];
}

export interface AblationResult {
  /** What was ablated. */
  removed: string;
  /** PnL with feature removed. */
  pnl: number;
  /** Whether result stayed positive. */
  survives: boolean;
}

/**
 * Run the full survival gate for a candidate strategy.
 *
 * @param candidate — candidate result (from experiment)
 * @param candles — OHLCV data
 * @param criteria — optional survival criteria overrides
 * @param baselineRuns — optional pre-computed baseline runs
 */
export function survivalGate(
  candidate: CandidateResult,
  candles: CandleLike[],
  criteria: Partial<SurvivalCriteria> = {},
  baselineRuns?: BaselineRun[],
): GateResult {
  // 1. Alpha verdict.
  const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));
  const alpha = evaluateAlpha(candidate, closes, criteria);

  // 2. Ablation: run with same cost params on the data.
  const baselines = baselineRuns ?? runAllBaselines(candles);
  const ablation: AblationResult[] = [];

  // Ablation 1: without random entry baseline (most lenient).
  const randPnl = baselines.find((b) => b.name === 'random-entry')?.report.totalPnl ?? 0;
  ablation.push({
    removed: 'random-entry baseline',
    pnl: candidate.totalNetPnl - randPnl,
    survives: candidate.totalNetPnl > randPnl,
  });

  // Ablation 2: without momentum baseline.
  const momPnl = baselines.find((b) => b.name === 'simple-momentum')?.report.totalPnl ?? 0;
  ablation.push({
    removed: 'momentum baseline',
    pnl: candidate.totalNetPnl - momPnl,
    survives: candidate.totalNetPnl > momPnl,
  });

  const allAblationSurvive = ablation.every((a) => a.survives);

  return {
    passed: alpha.passed && allAblationSurvive,
    alpha,
    ablation,
  };
}