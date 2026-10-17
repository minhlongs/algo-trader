/**
 * Alpha Lifecycle Transitions & Validation Helpers
 * Pure transition logic extracted from AlphaLifecycleStateMachine.
 */

import type { AlphaSurvivalGateEvaluation } from './alpha-survival-gate-types';
import {
  type AlphaLifecycleState,
  type PromotionCriteria,
  type PromotionStateTransition,
  CIRCUIT_BREAKER_MAX_DRAWDOWN,
  DEFAULT_PROMOTION_CRITERIA,
  createTransition,
} from './alpha-lifecycle-state-types';

export function buildValidateCandidateTransition(
  strategyId: string,
  currentState: AlphaLifecycleState,
  evalResult: AlphaSurvivalGateEvaluation,
  reason?: string,
): { targetState: AlphaLifecycleState; transition: PromotionStateTransition } {
  if (currentState === 'RETIRED') {
    throw new Error('Cannot validate candidate: strategy is in RETIRED state');
  }
  if (currentState !== 'DISCOVERED') {
    throw new Error(`Cannot validate candidate: strategy is in ${currentState} state (expected DISCOVERED)`);
  }

  const targetState: AlphaLifecycleState = evalResult.passed ? 'VALIDATED' : 'RETIRED';
  const defaultReason = evalResult.passed
    ? 'Candidate passed statistical survival gates'
    : (evalResult.diagnostics?.join('; ') || 'Candidate failed survival gates');

  const transition = createTransition(
    strategyId,
    currentState,
    targetState,
    reason ?? defaultReason,
    evalResult.metrics ? {
      sharpeRatio: evalResult.metrics.oosSharpeRatio,
      maxDrawdown: evalResult.metrics.maxDrawdown,
      profitFactor: evalResult.metrics.profitFactor,
      tradeCount: evalResult.metrics.totalTestTrades,
      winRate: evalResult.metrics.testWinRate,
    } : undefined,
  );

  return { targetState, transition };
}

export function buildStartPaperTradingTransition(
  strategyId: string,
  currentState: AlphaLifecycleState,
  reason?: string,
): PromotionStateTransition {
  if (currentState === 'RETIRED') {
    throw new Error('Cannot start paper trading: strategy is in RETIRED state (absorbing state)');
  }
  if (currentState === 'QUARANTINED') {
    throw new Error('Cannot start paper trading: strategy is in QUARANTINED state');
  }
  if (currentState !== 'VALIDATED' && currentState !== 'DISCOVERED') {
    throw new Error(`Cannot start paper trading: strategy is in ${currentState} state (expected VALIDATED)`);
  }

  return createTransition(
    strategyId,
    currentState,
    'PAPER_ACTIVE',
    reason ?? 'Strategy ingested into paper trading execution loop',
  );
}

export function buildPromotionTransition(
  strategyId: string,
  currentState: AlphaLifecycleState,
  metrics: {
    tradeCount: number;
    cumulativeSharpe?: number;
    sharpeRatio?: number;
    maxDrawdown: number;
    winRate?: number;
    totalNetPnl?: number;
  },
  criteria?: Partial<PromotionCriteria>,
): PromotionStateTransition | null {
  if (currentState !== 'PAPER_ACTIVE') return null;

  const minTrades = criteria?.minTradeCount ?? DEFAULT_PROMOTION_CRITERIA.minTradeCount;
  const minSharpe = criteria?.minCumulativeSharpe ?? DEFAULT_PROMOTION_CRITERIA.minCumulativeSharpe;
  const maxDd = criteria?.maxDrawdown ?? DEFAULT_PROMOTION_CRITERIA.maxDrawdown;
  const sharpe = metrics.cumulativeSharpe ?? metrics.sharpeRatio ?? 0;
  const dd = Math.abs(metrics.maxDrawdown);

  if (metrics.tradeCount >= minTrades && sharpe >= minSharpe && dd <= maxDd) {
    return createTransition(
      strategyId,
      currentState,
      'PROMOTED_LIVE_ELIGIBLE',
      `Strategy passed paper promotion hurdles: ${metrics.tradeCount} trades, Sharpe ${sharpe.toFixed(2)}, DD ${(dd * 100).toFixed(1)}%`,
      {
        tradeCount: metrics.tradeCount,
        totalTrades: metrics.tradeCount,
        sharpeRatio: sharpe,
        cumulativeSharpe: sharpe,
        maxDrawdown: dd,
        winRate: metrics.winRate ?? 0,
        totalNetPnl: metrics.totalNetPnl ?? 0,
      },
    );
  }
  return null;
}

export function buildDrawdownQuarantineTransition(
  strategyId: string,
  currentState: AlphaLifecycleState,
  drawdown: number,
  reason?: string,
): PromotionStateTransition | null {
  const absDd = Math.abs(drawdown);
  if (absDd >= CIRCUIT_BREAKER_MAX_DRAWDOWN && (currentState === 'PAPER_ACTIVE' || currentState === 'PROMOTED_LIVE_ELIGIBLE')) {
    return createTransition(
      strategyId,
      currentState,
      'QUARANTINED',
      reason ?? `Strategy quarantined by drawdown circuit breaker: ${(absDd * 100).toFixed(2)}% >= ${(CIRCUIT_BREAKER_MAX_DRAWDOWN * 100).toFixed(2)}%`,
      { maxDrawdown: absDd },
    );
  }
  return null;
}
