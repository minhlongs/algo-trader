/**
 * Alpha Lifecycle State Machine
 *
 * Implements the 4-stage lifecycle state machine:
 *   DISCOVERED -> PAPER_ACTIVE -> PROMOTED_LIVE_ELIGIBLE -> RETIRED
 *
 * Requirements:
 * - Feature 10: Alpha Promotion State Machine
 * - Feature 11: Statistical Promotion Gate Evaluation (10+1 canonical criteria)
 * - Feature 12: Retirement Transition Triggering
 */

import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { PromotionReadiness } from '../gates/gate-types';
import { evaluateGates } from '../gates/gate-evaluator-core';
import {
  type AlphaLifecycleState,
  type GateEvaluationMetrics,
  type PromotionStateTransition,
  createEmptyMetrics,
  createEmptyVerdict,
  mapStrategyStateToLifecycleState,
} from './alpha-lifecycle-state-types';
import { extractGateMetrics } from './alpha-lifecycle-metrics';

export {
  type AlphaLifecycleState,
  type GateEvaluationMetrics,
  type PromotionStateTransition,
  mapStrategyStateToLifecycleState,
  createEmptyMetrics,
  createEmptyVerdict,
} from './alpha-lifecycle-state-types';

export { extractGateMetrics } from './alpha-lifecycle-metrics';

export class AlphaLifecycleStateMachine {
  private state: AlphaLifecycleState;
  private readonly history: PromotionStateTransition[] = [];

  constructor(
    private readonly strategyId: string,
    initialState: AlphaLifecycleState = 'DISCOVERED',
  ) {
    this.state = initialState;
  }

  public getState(): AlphaLifecycleState {
    return this.state;
  }

  public getStrategyId(): string {
    return this.strategyId;
  }

  public isLiveEligible(): boolean {
    return this.state === 'PROMOTED_LIVE_ELIGIBLE';
  }

  public isRetired(): boolean {
    return this.state === 'RETIRED';
  }

  public getHistory(): PromotionStateTransition[] {
    return [...this.history];
  }

  /**
   * Transition from DISCOVERED to PAPER_ACTIVE upon deployment to paper trading.
   */
  public startPaperTrading(reason?: string): PromotionStateTransition {
    if (this.state === 'RETIRED') {
      throw new Error('Cannot start paper trading: strategy is in RETIRED state (absorbing state)');
    }
    if (this.state !== 'DISCOVERED') {
      throw new Error(`Cannot start paper trading: strategy is in ${this.state} state (expected DISCOVERED)`);
    }

    const timestamp = Date.now();
    const transition: PromotionStateTransition = {
      strategyId: this.strategyId,
      fromState: this.state,
      toState: 'PAPER_ACTIVE',
      timestamp,
      reason: reason ?? 'Strategy ingested into paper trading execution loop',
      metricsSnapshot: createEmptyMetrics(),
      gateVerdict: createEmptyVerdict(timestamp),
    };

    this.state = 'PAPER_ACTIVE';
    this.history.push(transition);
    return transition;
  }

  /**
   * Evaluate paper trading performance against the 10+1 canonical criteria.
   * Checks retirement criteria first; if triggered -> transitions to RETIRED.
   * If in PAPER_ACTIVE and all gates pass -> transitions to PROMOTED_LIVE_ELIGIBLE.
   */
  public evaluate(gateInput: GateEvaluatorInput): {
    transition?: PromotionStateTransition;
    verdict: PromotionReadiness;
    state: AlphaLifecycleState;
  } {
    const verdict = evaluateGates(gateInput);
    const metrics = extractGateMetrics(gateInput);

    // RETIRED is an absorbing state with no transitions out
    if (this.state === 'RETIRED') {
      return { verdict, state: 'RETIRED' };
    }

    // 1. Retirement check (Feature 12)
    // - Math.abs(metrics.maxDrawdown) > 0.15 (drawdown > 15%)
    // - totalNetPnl < 0 AND winRate < 0.45 when tradeCount >= 15
    // - oosConsistency divergence > 0.10
    const isDrawdownBreach = Math.abs(metrics.maxDrawdown) > 0.15;
    const isExpectancyBreach =
      metrics.tradeCount >= 15 &&
      metrics.totalNetPnl < 0 &&
      metrics.winRate < 0.45;
    const oosDivergence = metrics.oosGap ?? metrics.oosConsistency ?? null;
    const isOosBreach = oosDivergence !== null && oosDivergence > 0.10;

    if (isDrawdownBreach || isExpectancyBreach || isOosBreach) {
      let reason: string;
      if (isDrawdownBreach) {
        reason = `Drawdown breach: ${(Math.abs(metrics.maxDrawdown) * 100).toFixed(2)}% > 15.00% threshold`;
      } else if (isExpectancyBreach) {
        reason = `Persistent negative expectancy: PnL $${metrics.totalNetPnl.toFixed(2)}, win rate ${(metrics.winRate * 100).toFixed(1)}% < 45.0% after ${metrics.tradeCount} trades`;
      } else {
        reason = `OOS consistency divergence: gap ${oosDivergence?.toFixed(4)} > 0.10 threshold`;
      }

      const fromState = this.state;
      this.state = 'RETIRED';
      const transition: PromotionStateTransition = {
        strategyId: this.strategyId,
        fromState,
        toState: 'RETIRED',
        timestamp: Date.now(),
        reason,
        metricsSnapshot: metrics,
        gateVerdict: verdict,
      };
      this.history.push(transition);
      return { transition, verdict, state: 'RETIRED' };
    }

    // 2. Promotion check (Feature 10 & 11)
    // When state === 'PAPER_ACTIVE' and verdict.allPassed === true -> transitions to 'PROMOTED_LIVE_ELIGIBLE'
    if (this.state === 'PAPER_ACTIVE' && verdict.allPassed) {
      const fromState = this.state;
      this.state = 'PROMOTED_LIVE_ELIGIBLE';
      const reason = `All ${verdict.totalGates} canonical gates passed: eligible for live handoff`;
      const transition: PromotionStateTransition = {
        strategyId: this.strategyId,
        fromState,
        toState: 'PROMOTED_LIVE_ELIGIBLE',
        timestamp: Date.now(),
        reason,
        metricsSnapshot: metrics,
        gateVerdict: verdict,
      };
      this.history.push(transition);
      return { transition, verdict, state: 'PROMOTED_LIVE_ELIGIBLE' };
    }

    return { verdict, state: this.state };
  }

  /**
   * Retire a strategy (manual or external operator action).
   */
  public retire(reason: string, metrics?: GateEvaluationMetrics): PromotionStateTransition {
    if (this.state === 'RETIRED') {
      throw new Error('Strategy is already RETIRED');
    }

    const timestamp = Date.now();
    const fromState = this.state;
    this.state = 'RETIRED';
    const transition: PromotionStateTransition = {
      strategyId: this.strategyId,
      fromState,
      toState: 'RETIRED',
      timestamp,
      reason,
      metricsSnapshot: metrics ?? createEmptyMetrics(),
      gateVerdict: createEmptyVerdict(timestamp),
    };
    this.history.push(transition);
    return transition;
  }
}
