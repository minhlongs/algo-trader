/**
 * Walk-Forward Validation Types
 *
 * Per-step and summary result types for the walk-forward evaluation engine.
 */

import type { SplitMetrics } from '../experiments/experiment-types';
import type { BacktestTrade } from '../../desk/backtesting/types';

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
  /** Out-of-sample test trades for this step. */
  testTrades?: BacktestTrade[];
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
  /** Fraction of distinct market regimes with positive out-of-sample PnL. */
  regimeConsistencyScore: number;
  /** Average number of test trades per step. */
  avgTestTrades: number;
  /** Total trades across all test splits. */
  totalTestTrades: number;
  /** Out-of-sample annualized Sharpe ratio computed from stitched equity curve. */
  testSharpe: number;
  /** Out-of-sample maximum drawdown (e.g. 0.12 for 12%). */
  testMaxDrawdown: number;
  /** Out-of-sample profit factor across all test trades. */
  testProfitFactor: number;
  /** Out-of-sample total net PnL after costs. */
  testTotalPnl: number;
  /** Cumulative stitched out-of-sample equity curve. */
  cumulativeEquity: Array<{ timestamp: string; equity: number }>;
}

// ── Walk-Forward Result ───────────────────────────────────────────────────────

export interface WalkForwardResult {
  /** Per-step breakdown. */
  steps: StepResult[];
  /** Aggregated summary. */
  summary: WalkForwardSummary;
  /** All stitched out-of-sample test trades. */
  allTestTrades?: BacktestTrade[];
}