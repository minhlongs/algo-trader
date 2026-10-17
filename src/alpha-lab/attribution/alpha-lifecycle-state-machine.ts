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
  type PromotionStateTransition, CIRCUIT_BREAKER_MAX_DRAWDOWN, createTransition,
} from './alpha-lifecycle-state-types';
import { evaluateLifecycleGates } from './alpha-lifecycle-metrics';
import {
  buildValidateCandidateTransition,
  buildStartPaperTradingTransition,
  buildPromotionTransition,
  buildDrawdownQuarantineTransition,
} from './alpha-lifecycle-transitions';

export * from './alpha-lifecycle-state-types';
export * from './alpha-lifecycle-transitions';
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
    const { targetState, transition } = buildValidateCandidateTransition(
      this.strategyId, this.state, evalResult, reason,
    );
    this.state = targetState;
    this.history.push(transition);
    return transition;
  }

  public startPaperTrading(reason?: string): PromotionStateTransition {
    const transition = buildStartPaperTradingTransition(this.strategyId, this.state, reason);
    this.state = 'PAPER_ACTIVE';
    this.history.push(transition);
    return transition;
  }

  public checkPromotion(
    metrics: { tradeCount: number; cumulativeSharpe?: number; sharpeRatio?: number; maxDrawdown: number; winRate?: number; totalNetPnl?: number },
    criteria?: Partial<PromotionCriteria>,
  ): PromotionStateTransition | null {
    const transition = buildPromotionTransition(this.strategyId, this.state, metrics, criteria);
    if (transition) {
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
        const transition = buildDrawdownQuarantineTransition(this.strategyId, this.state, currentDrawdown, reason);
        if (transition) {
          this.state = 'QUARANTINED';
          this.history.push(transition);
        }
        return true;
      }
      return this.state === 'QUARANTINED';
    }
    return false;
  }

  public recordDrawdown(dd: number, reason?: string): PromotionStateTransition | null {
    const transition = buildDrawdownQuarantineTransition(this.strategyId, this.state, dd, reason);
    if (transition) {
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
