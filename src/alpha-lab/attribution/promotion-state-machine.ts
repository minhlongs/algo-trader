/**
 * Promotion State Machine
 *
 * Enforces the paper-only → promotion → live policy.
 * A strategy must pass through discrete states before it can be
 * considered for live trading.
 *
 * States:
 *   CANDIDATE → EVALUATED → BASELINE_GATE → WALK_FORWARD → SURVIVAL_GATE →
 *   PAPER_APPROVED → (manual review) → LIVE_APPROVED
 *
 * Only PAPER_APPROVED and LIVE_APPROVED strategies can be loaded
 * by the execution layer.
 */

export type StrategyState =
  | 'CANDIDATE'
  | 'EVALUATED'
  | 'BASELINE_GATE'
  | 'WALK_FORWARD'
  | 'SURVIVAL_GATE'
  | 'PAPER_APPROVED'
  | 'LIVE_APPROVED'
  | 'REJECTED';

export interface StateTransition {
  experimentId: string;
  state: StrategyState;
  timestamp: string;
  actor: 'system' | 'researcher' | 'reviewer' | 'operator';
  reason: string;
  version: string;
}

export interface PromotionPolicy {
  minWinRate: number;
  minSharpe: number;
  mustBeatBuyHold: boolean;
  mustBeatRandom: boolean;
  minConsistencyScore: number;
  minTestTrades: number;
  maxOverfitGap: number;
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minWinRate: 0.5,
  minSharpe: 0,
  mustBeatBuyHold: true,
  mustBeatRandom: true,
  minConsistencyScore: 0.5,
  minTestTrades: 10,
  maxOverfitGap: 0.15,
};

export function transition(
  current: StrategyState,
  trigger: 'evaluate' | 'baseline' | 'walkforward' | 'survival' | 'promote' | 'reject',
  evidence: Record<string, number | boolean | string>,
  policy = DEFAULT_PROMOTION_POLICY,
): StrategyState {
  const map: Record<string, StrategyState> = {
    evaluate: 'EVALUATED',
    baseline: 'BASELINE_GATE',
    walkforward: 'WALK_FORWARD',
    survival: 'SURVIVAL_GATE',
    promote: 'PAPER_APPROVED',
    reject: 'REJECTED',
  };

  const allowed: Record<StrategyState, string[]> = {
    CANDIDATE: ['evaluate'],
    EVALUATED: ['baseline'],
    BASELINE_GATE: ['walkforward'],
    WALK_FORWARD: ['survival'],
    SURVIVAL_GATE: ['promote', 'reject'],
    PAPER_APPROVED: ['promote'],
    LIVE_APPROVED: [],
    REJECTED: [],
  };

  if (!(allowed[current] ?? []).includes(trigger)) {
    return current;
  }

  if (trigger === 'survival' && !passesSurvival(evidence, policy)) {
    return 'REJECTED';
  }

  return map[trigger] ?? current;
}

function passesSurvival(evidence: Record<string, number | boolean | string>, policy: PromotionPolicy): boolean {
  const winRate = Number(evidence.winRate ?? 0);
  const sharpe = Number(evidence.sharpe ?? 0);
  const pnl = Number(evidence.totalNetPnl ?? 0);
  const randomPnl = Number(evidence.randomPnl ?? 0);
  const consistency = Number(evidence.consistencyScore ?? 0);
  const testTrades = Number(evidence.testTrades ?? 0);
  const overfit = Number(evidence.overfitGap ?? 0);

  if (winRate < policy.minWinRate) return false;
  if (sharpe < policy.minSharpe) return false;
  if (policy.mustBeatRandom && pnl <= randomPnl) return false;
  if (consistency < policy.minConsistencyScore) return false;
  if (testTrades < policy.minTestTrades) return false;
  if (overfit > policy.maxOverfitGap) return false;
  return true;
}