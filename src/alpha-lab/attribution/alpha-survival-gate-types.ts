/**
 * Alpha Survival Gate Types & Default Criteria
 *
 * Defines survival criteria, evaluation results, and diagnostic models
 * for institutional-grade statistical survival gates and overfitting filters.
 */

import type { WalkForwardSummary } from '../walkforward/walkforward-types';
import type { BacktestTrade } from '../../desk/backtesting/types';

export interface AlphaSurvivalGateCriteria {
  /** Minimum out-of-sample annualized Sharpe ratio (default: 1.5). */
  minOosSharpeRatio: number;
  /** Maximum allowable drawdown fraction (default: 0.12 = 12%). */
  maxDrawdown: number;
  /** Minimum profit factor (default: 1.25). */
  minProfitFactor: number;
  /** Minimum Deflated Sharpe Ratio (default: 0.95). */
  minDsr: number;
  /** Minimum regime consistency score across multi-regime splits (default: 0.70). */
  minRegimeConsistencyScore: number;
  /** Cost-stress friction multiplier (default: 3.0 = 3x). */
  costStressMultiplier: number;
  /** Base round-trip friction in bps (default: 10 bps). */
  baseFrictionBps: number;
  /** Conservative friction in bps round-trip (default: 20 bps = 0.0020). */
  conservativeFrictionBps: number;
  /** Adverse friction in bps round-trip (default: 50 bps = 0.0050). */
  adverseFrictionBps: number;
  /** Minimum required out-of-sample trades for statistical validity (default: 5). */
  minTestTrades: number;
  /** Number of candidate trials evaluated in sweep (default: 1). */
  nTrials?: number;
  /** Variance of Sharpe ratio across trials (optional, defaults to 1 / T). */
  trialsVariance?: number;
}

export const DEFAULT_ALPHA_SURVIVAL_CRITERIA: AlphaSurvivalGateCriteria = {
  minOosSharpeRatio: 1.5,
  maxDrawdown: 0.12,
  minProfitFactor: 1.25,
  minDsr: 0.95,
  minRegimeConsistencyScore: 0.70,
  costStressMultiplier: 3.0,
  baseFrictionBps: 10,
  conservativeFrictionBps: 20,
  adverseFrictionBps: 50,
  minTestTrades: 5,
  nTrials: 1,
};

export interface AlphaSurvivalGateEvaluation {
  /** Overall pass/fail: true if ALL gate checks pass. */
  passed: boolean;
  /** ISO-8601 timestamp of evaluation. */
  evaluatedAt: string;
  /** Observed metrics for convenience. */
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  dsr: number;
  regimeConsistencyScore: number;
  regimeConsistencyPassed: boolean;
  costStressPassed: boolean;
  conservativePnl: number;
  adversePnl: number;
  /** Full metrics snapshot. */
  metrics: {
    oosSharpeRatio: number;
    maxDrawdown: number;
    profitFactor: number;
    dsr: number;
    expectedMaxSharpe: number;
    skewness: number;
    kurtosis: number;
    regimeConsistencyScore: number;
    splitConsistencyScore: number;
    conservativeStressPnl: number;
    adverseStressPnl: number;
    conservativeStressSharpe: number;
    adverseStressSharpe: number;
    stressedPnl3x: number;
    testWinRate: number;
    testProfitFactor: number;
    totalTestTrades: number;
  };
  /** Status of each individual gate check. */
  checks: {
    sharpePassed: boolean;
    drawdownPassed: boolean;
    profitFactorPassed: boolean;
    dsrPassed: boolean;
    regimeConsistencyPassed: boolean;
    costStressPassed: boolean;
    costStressConservativePassed: boolean;
    costStressAdversePassed: boolean;
  };
  /** Alias for checks (backwards compatibility). */
  gateChecks: {
    sharpePassed: boolean;
    drawdownPassed: boolean;
    profitFactorPassed: boolean;
    dsrPassed: boolean;
    regimeConsistencyPassed: boolean;
    costStressPassed: boolean;
  };
  /** Threshold criteria used. */
  thresholds: AlphaSurvivalGateCriteria;
  /** Explicit diagnostics array explaining why a candidate failed. */
  diagnostics: string[];
  /** Failure messages (alias to diagnostics for backwards compatibility). */
  failures: string[];
  rejectionReasons: string[];
}

export type AlphaSurvivalGateResult = AlphaSurvivalGateEvaluation;

export interface EvaluateAlphaSurvivalGateInput {
  summary: WalkForwardSummary;
  trades?: BacktestTrade[];
  criteria?: Partial<AlphaSurvivalGateCriteria>;
  baselineFeeBps?: number;      // default: 5 bps per side (10 bps round-trip)
  baselineSlippageBps?: number; // default: 2 bps per side (4 bps round-trip)
  nTrials?: number;
  trialsVariance?: number;
  periodicReturns?: number[];
}
