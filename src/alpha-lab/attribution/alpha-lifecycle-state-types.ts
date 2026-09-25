/**
 * Alpha Lifecycle State Machine Types & Mapping Helpers
 */

import type { PromotionReadiness } from '../gates/gate-types';
import type { StrategyState } from './promotion-state-machine';

export type AlphaLifecycleState =
  | 'DISCOVERED'
  | 'PAPER_ACTIVE'
  | 'PROMOTED_LIVE_ELIGIBLE'
  | 'RETIRED';

export interface GateEvaluationMetrics {
  totalTrades: number;
  tradeCount: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  daysActive: number;
  oosGap: number | null;
  oosConsistency?: number | null;
  totalNetPnl: number;
  totalPnl?: number;
}

export interface PromotionStateTransition {
  strategyId: string;
  fromState: AlphaLifecycleState;
  toState: AlphaLifecycleState;
  timestamp: number;
  reason: string;
  metricsSnapshot: GateEvaluationMetrics;
  gateVerdict: PromotionReadiness;
}

/**
 * Maps legacy StrategyState to high-level AlphaLifecycleState.
 */
export function mapStrategyStateToLifecycleState(state: StrategyState): AlphaLifecycleState {
  switch (state) {
    case 'CANDIDATE':
    case 'EVALUATED':
    case 'BASELINE_GATE':
    case 'WALK_FORWARD':
    case 'SURVIVAL_GATE':
      return 'DISCOVERED';
    case 'PAPER_APPROVED':
      return 'PAPER_ACTIVE';
    case 'LIVE_APPROVED':
      return 'PROMOTED_LIVE_ELIGIBLE';
    case 'REJECTED':
      return 'RETIRED';
    default:
      return 'DISCOVERED';
  }
}

export function createEmptyMetrics(): GateEvaluationMetrics {
  return {
    totalTrades: 0,
    tradeCount: 0,
    winRate: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    daysActive: 0,
    oosGap: null,
    oosConsistency: null,
    totalNetPnl: 0,
    totalPnl: 0,
  };
}

export function createEmptyVerdict(timestamp: number): PromotionReadiness {
  return {
    evaluatedAt: new Date(timestamp).toISOString(),
    gates: [],
    allPassed: false,
    passedCount: 0,
    totalGates: 0,
    estimatedDaysRemaining: null,
  };
}
