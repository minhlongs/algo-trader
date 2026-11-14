/**
 * Polymarket fail-closed pre-trade risk engine.
 *
 * Pure and deterministic: no I/O, no clock read. `nowMs` and all state arrive
 * as arguments. A check that cannot be positively evaluated returns a BLOCK,
 * never a pass. Missing, `'unknown'` and malformed values all reach the same
 * deny branch, so forgetting to supply state cannot silently widen the gate.
 */

import {
  type PolyOrderIntent,
  type PolyPortfolioKellyRiskState,
  type PolyRiskBlockReason,
  type PolyRiskBudgetState,
  type PolyRiskState,
  type PolyRiskVerdict,
} from './poly-risk-types';
import {
  checkDrawdown,
  checkFeeSchedule,
  checkGtdExpiration,
  checkIntent,
  checkKillSwitch,
  checkMarketData,
  checkMinSize,
  checkNotional,
  checkPortfolioKelly,
  checkPositionReconciliation,
  deny,
  isNumber,
  resolved,
} from './poly-fail-closed-risk-checks';

export type {
  PolyOrderIntent,
  PolyPortfolioKellyRiskState,
  PolyRiskBlockReason,
  PolyRiskState,
  PolyRiskVerdict,
} from './poly-risk-types';

/** Absent budget fails both budget checks; an empty record fails them too. */
function budgetOf(state: PolyRiskState): PolyRiskBudgetState {
  return resolved(state.riskBudget) ?? { maxNotionalUsd: 'unknown', currentDrawdownPct: 'unknown' };
}

/** Evaluate one order intent against resolved risk state (fail-closed). */
export function evaluatePolyRisk(intent: PolyOrderIntent, state: PolyRiskState): PolyRiskVerdict {
  const { nowMs } = state;
  if (!isNumber(nowMs)) {
    return deny('UNRESOLVED_STATE', 'evaluation clock (nowMs) is unknown');
  }
  const budget = budgetOf(state);
  const checks: Array<() => PolyRiskVerdict | null> = [
    () => checkKillSwitch(state.killSwitch),
    () => checkIntent(intent),
    () => checkMarketData(state.marketData, nowMs),
    () => checkFeeSchedule(state.feeSchedule, intent),
    () => checkPositionReconciliation(state.positionReconciliation, nowMs),
    () => checkMinSize(intent),
    () => checkGtdExpiration(intent, nowMs),
    () => checkNotional(intent, budget),
    () => checkDrawdown(budget),
    () => checkPortfolioKelly(intent, state.portfolioKelly),
  ];
  for (const check of checks) {
    const verdict = check();
    if (verdict) return verdict;
  }
  return { allowed: true };
}
