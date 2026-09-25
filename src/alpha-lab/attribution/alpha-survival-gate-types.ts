/**
 * Alpha Survival Gate Types & Default Criteria
 */

import type { WalkForwardSummary } from '../walkforward/walkforward-types';
import type { BacktestTrade } from '../../desk/backtesting/types';

export interface AlphaSurvivalGateCriteria {
  /** Minimum out-of-sample annualized Sharpe ratio (default: 1.0). */
  minOosSharpeRatio: number;
  /** Maximum allowable drawdown fraction (default: 0.15 = 15%). */
  maxDrawdown: number;
  /** Minimum regime consistency score across multi-regime splits (default: 0.50). */
  minRegimeConsistencyScore: number;
  /** Conservative friction in bps round-trip (default: 20 bps = 0.0020). */
  conservativeFrictionBps: number;
  /** Adverse friction in bps round-trip (default: 50 bps = 0.0050). */
  adverseFrictionBps: number;
  /** Minimum required out-of-sample trades for statistical validity (default: 5). */
  minTestTrades: number;
}

export const DEFAULT_ALPHA_SURVIVAL_CRITERIA: AlphaSurvivalGateCriteria = {
  minOosSharpeRatio: 1.0,
  maxDrawdown: 0.15,
  minRegimeConsistencyScore: 0.50,
  conservativeFrictionBps: 20,
  adverseFrictionBps: 50,
  minTestTrades: 5,
};

export interface AlphaSurvivalGateResult {
  /** Overall pass/fail: true if ALL gate checks pass. */
  passed: boolean;
  /** ISO-8601 timestamp of evaluation. */
  evaluatedAt: string;
  /** Observed metrics for convenience. */
  sharpeRatio: number;
  maxDrawdown: number;
  regimeConsistencyScore: number;
  costStressPassed: boolean;
  conservativePnl: number;
  adversePnl: number;
  /** Full metrics snapshot. */
  metrics: {
    oosSharpeRatio: number;
    maxDrawdown: number;
    regimeConsistencyScore: number;
    splitConsistencyScore: number;
    conservativeStressPnl: number;
    adverseStressPnl: number;
    conservativeStressSharpe: number;
    adverseStressSharpe: number;
    testWinRate: number;
    testProfitFactor: number;
    totalTestTrades: number;
  };
  /** Status of each individual gate check. */
  checks: {
    sharpePassed: boolean;
    drawdownPassed: boolean;
    regimeConsistencyPassed: boolean;
    costStressConservativePassed: boolean;
    costStressAdversePassed: boolean;
  };
  /** Alias for checks (backwards compatibility with alternative schemas). */
  gateChecks: {
    sharpePassed: boolean;
    drawdownPassed: boolean;
    regimeConsistencyPassed: boolean;
    costStressPassed: boolean;
  };
  /** Threshold criteria used. */
  thresholds: AlphaSurvivalGateCriteria;
  /** Failure messages. */
  failures: string[];
  rejectionReasons: string[];
}

export interface EvaluateAlphaSurvivalGateInput {
  summary: WalkForwardSummary;
  trades?: BacktestTrade[];
  criteria?: Partial<AlphaSurvivalGateCriteria>;
  baselineFeeBps?: number;      // default: 5 bps per side (10 bps round-trip)
  baselineSlippageBps?: number; // default: 2 bps per side (4 bps round-trip)
}
