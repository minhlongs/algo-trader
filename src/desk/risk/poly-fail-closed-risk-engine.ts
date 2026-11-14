/**
 * Polymarket fail-closed pre-trade risk engine.
 *
 * Pure and deterministic: no I/O, no clock read. `nowMs` and all state arrive
 * as arguments. A check that cannot be positively evaluated returns a BLOCK,
 * never a pass. Missing, `'unknown'` and malformed values all reach the same
 * deny branch, so forgetting to supply state cannot silently widen the gate.
 */

import {
  DRAWDOWN_AUTO_HALT_PCT,
  MARKET_DATA_MAX_AGE_MS,
  MIN_RESTING_ORDER_SIZE_SHARES,
  POSITION_RECONCILIATION_MAX_AGE_MS,
  type PolyFeeScheduleState,
  type PolyKillSwitchState,
  type PolyMarketDataState,
  type PolyOrderIntent,
  type PolyPositionReconciliationState,
  type PolyRiskBlockReason,
  type PolyRiskBudgetState,
  type PolyRiskState,
  type PolyRiskVerdict,
} from './poly-risk-types';

export type {
  PolyOrderIntent,
  PolyRiskBlockReason,
  PolyRiskState,
  PolyRiskVerdict,
} from './poly-risk-types';

/** True only for a finite real number. `NaN`, `Infinity`, strings: false. */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Narrow a state field that a caller may legitimately mark `'unknown'` or
 * omit. Returns `null` for those, which every caller turns into a block.
 */
function resolved<T extends object>(value: T | 'unknown' | undefined): T | null {
  return typeof value === 'object' && value !== null ? value : null;
}

function deny(reason: PolyRiskBlockReason, detail: string): PolyRiskVerdict {
  return { allowed: false, reason, detail };
}

/** A resting order needs the venue minimum; FOK/IOC execute-or-die instead. */
function checkMinSize(intent: PolyOrderIntent): PolyRiskVerdict | null {
  const rests = intent.orderType === 'GTC' || intent.orderType === 'GTD';
  if (!rests || intent.size >= MIN_RESTING_ORDER_SIZE_SHARES) return null;
  const msg = `size ${intent.size} is below the ${MIN_RESTING_ORDER_SIZE_SHARES}-share minimum`;
  return deny('ORDER_BELOW_MIN_SIZE', `${intent.orderType} ${msg}`);
}

function checkGtdExpiration(intent: PolyOrderIntent, nowMs: number): PolyRiskVerdict | null {
  if (intent.orderType !== 'GTD') return null;
  if (!isNumber(intent.expiration) || intent.expiration * 1_000 <= nowMs) {
    return deny('INVALID_INTENT', 'GTD intent requires a finite future expiration (unix seconds)');
  }
  return null;
}

function checkNotional(intent: PolyOrderIntent, budget: PolyRiskBudgetState): PolyRiskVerdict | null {
  const cap = budget.maxNotionalUsd;
  if (!isNumber(cap) || cap <= 0) {
    return deny('UNRESOLVED_STATE', 'risk budget: maxNotionalUsd is not a positive number');
  }
  const notional = intent.price * intent.size;
  if (!isNumber(notional)) return deny('INVALID_INTENT', 'order notional is not a finite number');
  if (notional <= cap) return null;
  return deny('NOTIONAL_ABOVE_CAP', `notional $${notional.toFixed(2)} exceeds cap $${cap.toFixed(2)}`);
}

function checkDrawdown(budget: PolyRiskBudgetState): PolyRiskVerdict | null {
  const pct = budget.currentDrawdownPct;
  if (!isNumber(pct) || pct < 0) {
    return deny('UNRESOLVED_STATE', 'risk budget: currentDrawdownPct is not a non-negative number');
  }
  if (pct < DRAWDOWN_AUTO_HALT_PCT) return null;
  return deny(
    'DRAWDOWN_AUTO_HALT',
    `drawdown ${pct.toFixed(2)}% is at or beyond the ${DRAWDOWN_AUTO_HALT_PCT}% auto-halt threshold`,
  );
}

function checkKillSwitch(flag: PolyKillSwitchState): PolyRiskVerdict | null {
  if (flag === 'inactive') return null;
  if (flag === 'active') return deny('KILL_SWITCH_ACTIVE', 'kill switch is latched; no new order');
  return deny(
    'KILL_SWITCH_STATE_UNKNOWN',
    `kill switch state is ${String(flag)}; it must be positively known to be inactive`,
  );
}

function checkMarketData(
  marketInput: PolyMarketDataState | 'unknown' | undefined,
  nowMs: number,
): PolyRiskVerdict | null {
  const observedAtMs = resolved(marketInput)?.observedAtMs;
  if (!isNumber(observedAtMs)) {
    return deny('UNRESOLVED_STATE', 'market data: observation timestamp is unknown');
  }
  const ageMs = nowMs - observedAtMs;
  if (ageMs < 0) return deny('STALE_MARKET_DATA', `market data is ${-ageMs}ms in the future of the clock`);
  if (ageMs <= MARKET_DATA_MAX_AGE_MS) return null;
  return deny('STALE_MARKET_DATA', `market data is ${ageMs}ms old, TTL is ${MARKET_DATA_MAX_AGE_MS}ms`);
}

function checkFeeSchedule(
  input: PolyFeeScheduleState | 'unknown' | undefined,
  intent: PolyOrderIntent,
): PolyRiskVerdict | null {
  const fee = resolved(input);
  if (!fee || fee.tokenId !== intent.tokenId) {
    return deny('UNKNOWN_FEE_SCHEDULE', `no fee schedule resolved for token ${intent.tokenId}`);
  }
  if (fee.rate === null) return null; // resolved exempt market, not a missing value
  if (!isNumber(fee.rate) || fee.rate < 0) {
    return deny('UNKNOWN_FEE_SCHEDULE', 'fee schedule rate is not a non-negative number');
  }
  if (!isNumber(fee.exponent) || fee.exponent <= 0) {
    return deny('UNKNOWN_FEE_SCHEDULE', 'fee schedule exponent is not a positive number');
  }
  return null;
}

function checkPositionReconciliation(
  input: PolyPositionReconciliationState | 'unknown' | undefined,
  nowMs: number,
): PolyRiskVerdict | null {
  const positions = resolved(input);
  if (!positions || positions.reconciled !== true) {
    return deny('POSITION_RECONCILIATION_UNRESOLVED', 'open positions were never reconciled');
  }
  const atMs = positions.reconciledAtMs;
  const count = positions.openPositionCount;
  if (!isNumber(atMs) || !isNumber(count) || count < 0) {
    return deny('POSITION_RECONCILIATION_UNRESOLVED', 'reconciliation timestamp or count is unknown');
  }
  const ageMs = nowMs - atMs;
  if (ageMs >= 0 && ageMs <= POSITION_RECONCILIATION_MAX_AGE_MS) return null;
  return deny(
    'POSITION_RECONCILIATION_UNRESOLVED',
    `reconciliation is ${ageMs}ms old, TTL is ${POSITION_RECONCILIATION_MAX_AGE_MS}ms`,
  );
}

const VALID_ORDER_TYPES = new Set(['GTC', 'GTD', 'FOK', 'IOC']);

function checkIntent(intent: PolyOrderIntent): PolyRiskVerdict | null {
  if (!intent.tokenId) return deny('INVALID_INTENT', 'intent has no tokenId');
  if (intent.side !== 'buy' && intent.side !== 'sell') {
    return deny('INVALID_INTENT', `intent side ${String(intent.side)} is not buy or sell`);
  }
  if (!VALID_ORDER_TYPES.has(intent.orderType)) {
    return deny('INVALID_INTENT', `intent orderType ${String(intent.orderType)} is unsupported`);
  }
  if (!isNumber(intent.price) || intent.price <= 0 || intent.price >= 1) {
    return deny('INVALID_INTENT', 'intent price must be a finite number strictly inside (0, 1)');
  }
  if (!isNumber(intent.size) || intent.size <= 0) {
    return deny('INVALID_INTENT', 'intent size must be a positive finite number');
  }
  return null;
}

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
  ];
  for (const check of checks) {
    const verdict = check();
    if (verdict) return verdict;
  }
  return { allowed: true };
}
