/**
 * Alpha Lifecycle State Machine
 *
 * Implements the canonical 6-stage lifecycle state machine:
 *   DISCOVERED -> VALIDATED -> PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE -> QUARANTINED / RETIRED
 */

import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { PromotionReadiness } from '../gates/gate-types';
import type { AlphaSurvivalGateEvaluation } from './alpha-survival-gate-types';
import {
  type AlphaLifecycleState, type GateEvaluationMetrics, type PromotionCriteria,
  type PromotionStateTransition, CIRCUIT_BREAKER_MAX_DRAWDOWN, DEFAULT_PROMOTION_CRITERIA, createTransition,
} from './alpha-lifecycle-state-types';
import { evaluateLifecycleGates } from './alpha-lifecycle-metrics';

export * from './alpha-lifecycle-state-types';
export { extractGateMetrics } from './alpha-lifecycle-metrics';

export class AlphaLifecycleStateMachine {
  private state: AlphaLifecycleState;
  private readonly history: PromotionStateTransition[] = [];

  constructor(
    private readonly strategyId: string,
    initialState: AlphaLifecycleState = 'DISCOVERED',
    initialHistory: PromotionStateTransition[] = [],
  ) {
    this.state = initialState;
    this.history = [...initialHistory];
  }

  public getState(): AlphaLifecycleState { return this.state; }
  public getStrategyId(): string { return this.strategyId; }
  public isValidated(): boolean { return this.state === 'VALIDATED'; }
  public isPaperActive(): boolean { return this.state === 'PAPER_ACTIVE'; }
  public isQuarantined(): boolean { return this.state === 'QUARANTINED'; }
  public isPromoted(): boolean { return this.state === 'PROMOTED_LIVE_ELIGIBLE'; }
  public isLiveEligible(): boolean { return this.state === 'PROMOTED_LIVE_ELIGIBLE'; }
  public isRetired(): boolean { return this.state === 'RETIRED'; }
  public getHistory(): PromotionStateTransition[] { return [...this.history]; }

  public validateCandidate(evalResult: AlphaSurvivalGateEvaluation, reason?: string): PromotionStateTransition {
    if (this.state === 'RETIRED') throw new Error('Cannot validate candidate: strategy is in RETIRED state');
    if (this.state !== 'DISCOVERED') {
      throw new Error(`Cannot validate candidate: strategy is in ${this.state} state (expected DISCOVERED)`);
    }

    const targetState: AlphaLifecycleState = evalResult.passed ? 'VALIDATED' : 'RETIRED';
    const defaultReason = evalResult.passed
      ? 'Candidate passed statistical survival gates'
      : (evalResult.diagnostics?.join('; ') || 'Candidate failed survival gates');

    const transition = createTransition(
      this.strategyId, this.state, targetState, reason ?? defaultReason,
      evalResult.metrics ? {
        sharpeRatio: evalResult.metrics.oosSharpeRatio,
        maxDrawdown: evalResult.metrics.maxDrawdown,
        profitFactor: evalResult.metrics.profitFactor,
        tradeCount: evalResult.metrics.totalTestTrades,
        winRate: evalResult.metrics.testWinRate,
      } : undefined,
    );
    this.state = targetState;
    this.history.push(transition);
    return transition;
  }

  public startPaperTrading(reason?: string): PromotionStateTransition {
    if (this.state === 'RETIRED') throw new Error('Cannot start paper trading: strategy is in RETIRED state (absorbing state)');
    if (this.state === 'QUARANTINED') throw new Error('Cannot start paper trading: strategy is in QUARANTINED state');
    if (this.state !== 'VALIDATED' && this.state !== 'DISCOVERED') {
      throw new Error(`Cannot start paper trading: strategy is in ${this.state} state (expected VALIDATED)`);
    }

    const transition = createTransition(
      this.strategyId, this.state, 'PAPER_ACTIVE',
      reason ?? 'Strategy ingested into paper trading execution loop',
    );
    this.state = 'PAPER_ACTIVE';
    this.history.push(transition);
    return transition;
  }

  public checkPromotion(
    metrics: { tradeCount: number; cumulativeSharpe?: number; sharpeRatio?: number; maxDrawdown: number; winRate?: number; totalNetPnl?: number },
    criteria?: Partial<PromotionCriteria>,
  ): PromotionStateTransition | null {
    if (this.state !== 'PAPER_ACTIVE') return null;

    const minTrades = criteria?.minTradeCount ?? DEFAULT_PROMOTION_CRITERIA.minTradeCount;
    const minSharpe = criteria?.minCumulativeSharpe ?? DEFAULT_PROMOTION_CRITERIA.minCumulativeSharpe;
    const maxDd = criteria?.maxDrawdown ?? DEFAULT_PROMOTION_CRITERIA.maxDrawdown;
    const sharpe = metrics.cumulativeSharpe ?? metrics.sharpeRatio ?? 0;
    const dd = Math.abs(metrics.maxDrawdown);

    if (metrics.tradeCount >= minTrades && sharpe >= minSharpe && dd <= maxDd) {
      const transition = createTransition(
        this.strategyId, this.state, 'PROMOTED_LIVE_ELIGIBLE',
        `Strategy passed paper promotion hurdles: ${metrics.tradeCount} trades, Sharpe ${sharpe.toFixed(2)}, DD ${(dd * 100).toFixed(1)}%`,
        { tradeCount: metrics.tradeCount, totalTrades: metrics.tradeCount, sharpeRatio: sharpe, cumulativeSharpe: sharpe, maxDrawdown: dd, winRate: metrics.winRate ?? 0, totalNetPnl: metrics.totalNetPnl ?? 0 },
      );
      this.state = 'PROMOTED_LIVE_ELIGIBLE';
      this.history.push(transition);
      return transition;
    }
    return null;
  }

  public checkDrawdownQuarantine(currentDrawdown: number, reason?: string): boolean {
    const dd = Math.abs(currentDrawdown);
    if (dd >= CIRCUIT_BREAKER_MAX_DRAWDOWN) {
      if (this.state === 'PAPER_ACTIVE' || this.state === 'PROMOTED_LIVE_ELIGIBLE') {
        const transition = createTransition(
          this.strategyId, this.state, 'QUARANTINED',
          reason ?? `Strategy quarantined by drawdown circuit breaker: ${(dd * 100).toFixed(2)}% >= ${(CIRCUIT_BREAKER_MAX_DRAWDOWN * 100).toFixed(2)}%`,
          { maxDrawdown: dd },
        );
        this.state = 'QUARANTINED';
        this.history.push(transition);
        return true;
      }
      return this.state === 'QUARANTINED';
    }
    return false;
  }

  public recordDrawdown(dd: number, reason?: string): PromotionStateTransition | null {
    const absDd = Math.abs(dd);
    if (absDd >= CIRCUIT_BREAKER_MAX_DRAWDOWN && (this.state === 'PAPER_ACTIVE' || this.state === 'PROMOTED_LIVE_ELIGIBLE')) {
      const transition = createTransition(
        this.strategyId, this.state, 'QUARANTINED',
        reason ?? `Strategy quarantined by drawdown circuit breaker: ${(absDd * 100).toFixed(2)}% >= ${(CIRCUIT_BREAKER_MAX_DRAWDOWN * 100).toFixed(2)}%`,
        { maxDrawdown: absDd },
      );
      this.state = 'QUARANTINED';
      this.history.push(transition);
      return transition;
    }
    return null;
  }

  public clearQuarantine(reason?: string): PromotionStateTransition {
    if (this.state !== 'QUARANTINED') {
      throw new Error(`Cannot clear quarantine: strategy is in ${this.state} state (expected QUARANTINED)`);
    }
    const transition = createTransition(this.strategyId, 'QUARANTINED', 'PAPER_ACTIVE', reason ?? 'Operator cleared drawdown quarantine');
    this.state = 'PAPER_ACTIVE';
    this.history.push(transition);
    return transition;
  }

  public decommission(reason?: string): PromotionStateTransition {
    if (this.state === 'RETIRED') throw new Error('Strategy is already RETIRED');
    const transition = createTransition(this.strategyId, this.state, 'RETIRED', reason ?? 'Permanent decommission of strategy');
    this.state = 'RETIRED';
    this.history.push(transition);
    return transition;
  }

  public retire(reason: string, metrics?: GateEvaluationMetrics): PromotionStateTransition {
    if (this.state === 'RETIRED') throw new Error('Strategy is already RETIRED');
    const transition = createTransition(this.strategyId, this.state, 'RETIRED', reason, metrics);
    this.state = 'RETIRED';
    this.history.push(transition);
    return transition;
  }

  public evaluate(gateInput: GateEvaluatorInput): {
    transition?: PromotionStateTransition;
    verdict: PromotionReadiness;
    state: AlphaLifecycleState;
  } {
    const outcome = evaluateLifecycleGates(gateInput, this.state);
    if (outcome.action === 'RETIRE' && this.state !== 'RETIRED') {
      const transition = this.retire(outcome.reason, outcome.metrics);
      transition.gateVerdict = outcome.verdict;
      return { transition, verdict: outcome.verdict, state: 'RETIRED' };
    }
    if (outcome.action === 'QUARANTINE' && (this.state === 'PAPER_ACTIVE' || this.state === 'PROMOTED_LIVE_ELIGIBLE')) {
      const transition = createTransition(this.strategyId, this.state, 'QUARANTINED', outcome.reason, outcome.metrics, outcome.verdict);
      this.state = 'QUARANTINED';
      this.history.push(transition);
      return { transition, verdict: outcome.verdict, state: 'QUARANTINED' };
    }
    if (outcome.action === 'PROMOTE' && this.state === 'PAPER_ACTIVE') {
      const transition = createTransition(this.strategyId, this.state, 'PROMOTED_LIVE_ELIGIBLE', outcome.reason, outcome.metrics, outcome.verdict);
      this.state = 'PROMOTED_LIVE_ELIGIBLE';
      this.history.push(transition);
      return { transition, verdict: outcome.verdict, state: 'PROMOTED_LIVE_ELIGIBLE' };
    }
    return { verdict: outcome.verdict, state: this.state };
  }
}
