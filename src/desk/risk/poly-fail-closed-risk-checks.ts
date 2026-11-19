/**
 * Pure fail-closed domain checks for the Polymarket pre-trade risk engine.
 */

import {
  CLUSTER_TAIL_LOSS_MAX_NAV_FRACTION,
  DRAWDOWN_AUTO_HALT_PCT,
  MIN_RESTING_ORDER_SIZE_SHARES,
  PORTFOLIO_KELLY_DRAWDOWN_FREEZE_PCT,
  PORTFOLIO_UMA_DISPUTE_MAX_NAV_PCT,
  POSITION_RECONCILIATION_MAX_AGE_MS,
  type PolyFeeScheduleState,
  type PolyKillSwitchState,
  type PolyMarketDataState,
  type PolyOrderIntent,
  type PolyPortfolioKellyRiskState,
  type PolyPositionReconciliationState,
  type PolyRiskBlockReason,
  type PolyRiskBudgetState,
  type PolyRiskVerdict,
} from './poly-risk-types';
import {
  evaluateMarketDataFreshness,
  type MarketDataFreshnessPolicy,
} from './poly-freshness-policy';

const VALID_ORDER_TYPES = new Set(['GTC', 'GTD', 'FOK', 'IOC']);

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function resolved<T extends object>(value: T | 'unknown' | undefined): T | null {
  return typeof value === 'object' && value !== null ? value : null;
}

export function deny(reason: PolyRiskBlockReason, detail: string): PolyRiskVerdict {
  return { allowed: false, reason, detail };
}

export function checkMinSize(intent: PolyOrderIntent): PolyRiskVerdict | null {
  const rests = intent.orderType === 'GTC' || intent.orderType === 'GTD';
  if (!rests || intent.size >= MIN_RESTING_ORDER_SIZE_SHARES) return null;
  return deny('ORDER_BELOW_MIN_SIZE', `${intent.orderType} size ${intent.size} is below the ${MIN_RESTING_ORDER_SIZE_SHARES}-share minimum`);
}

export function checkGtdExpiration(intent: PolyOrderIntent, nowMs: number): PolyRiskVerdict | null {
  if (intent.orderType !== 'GTD') return null;
  if (!isNumber(intent.expiration) || intent.expiration * 1_000 <= nowMs) {
    return deny('INVALID_INTENT', 'GTD intent requires a finite future expiration (unix seconds)');
  }
  return null;
}

export function checkNotional(intent: PolyOrderIntent, budget: PolyRiskBudgetState): PolyRiskVerdict | null {
  const cap = budget.maxNotionalUsd;
  if (!isNumber(cap) || cap <= 0) return deny('UNRESOLVED_STATE', 'risk budget: maxNotionalUsd is not a positive number');
  const notional = intent.price * intent.size;
  if (!isNumber(notional)) return deny('INVALID_INTENT', 'order notional is not a finite number');
  return notional <= cap ? null : deny('NOTIONAL_ABOVE_CAP', `notional $${notional.toFixed(2)} exceeds cap $${cap.toFixed(2)}`);
}

export function checkDrawdown(budget: PolyRiskBudgetState): PolyRiskVerdict | null {
  const pct = budget.currentDrawdownPct;
  if (!isNumber(pct) || pct < 0) return deny('UNRESOLVED_STATE', 'risk budget: currentDrawdownPct is not a non-negative number');
  if (pct < DRAWDOWN_AUTO_HALT_PCT) return null;
  return deny('DRAWDOWN_AUTO_HALT', `drawdown ${pct.toFixed(2)}% is at or beyond the ${DRAWDOWN_AUTO_HALT_PCT}% auto-halt threshold`);
}

export function checkKillSwitch(flag: PolyKillSwitchState): PolyRiskVerdict | null {
  if (flag === 'inactive') return null;
  if (flag === 'active') return deny('KILL_SWITCH_ACTIVE', 'kill switch is latched; no new order');
  return deny('KILL_SWITCH_STATE_UNKNOWN', `kill switch state is ${String(flag)}; it must be positively known to be inactive`);
}

export function checkMarketData(
  marketInput: PolyMarketDataState | 'unknown' | undefined,
  nowMs: number,
  policyOrMaxAgeMs?: MarketDataFreshnessPolicy | number,
): PolyRiskVerdict | null {
  const market = resolved(marketInput);
  const policy: MarketDataFreshnessPolicy | undefined =
    typeof policyOrMaxAgeMs === 'number'
      ? { ...market?.freshnessPolicy, maxMarketDataAgeMs: policyOrMaxAgeMs }
      : (policyOrMaxAgeMs ?? market?.freshnessPolicy);
  const verdict = evaluateMarketDataFreshness(market ?? 'unknown', nowMs, policy);
  if (verdict.ok) return null;
  if (verdict.unresolved) return deny('UNRESOLVED_STATE', verdict.reason);
  return deny('STALE_MARKET_DATA', `[${verdict.action}] ${verdict.reason}`);
}

export function checkFeeSchedule(input: PolyFeeScheduleState | 'unknown' | undefined, intent: PolyOrderIntent): PolyRiskVerdict | null {
  const fee = resolved(input);
  if (!fee || fee.tokenId !== intent.tokenId) return deny('UNKNOWN_FEE_SCHEDULE', `no fee schedule resolved for token ${intent.tokenId}`);
  if (fee.rate === null) return null;
  if (!isNumber(fee.rate) || fee.rate < 0) return deny('UNKNOWN_FEE_SCHEDULE', 'fee schedule rate is not a non-negative number');
  if (!isNumber(fee.exponent) || fee.exponent <= 0) return deny('UNKNOWN_FEE_SCHEDULE', 'fee schedule exponent is not a positive number');
  return null;
}

export function checkPositionReconciliation(input: PolyPositionReconciliationState | 'unknown' | undefined, nowMs: number): PolyRiskVerdict | null {
  const positions = resolved(input);
  if (!positions || positions.reconciled !== true) return deny('POSITION_RECONCILIATION_UNRESOLVED', 'open positions were never reconciled');
  const { reconciledAtMs: atMs, openPositionCount: count } = positions;
  if (!isNumber(atMs) || !isNumber(count) || count < 0) return deny('POSITION_RECONCILIATION_UNRESOLVED', 'reconciliation timestamp or count is unknown');
  const ageMs = nowMs - atMs;
  if (ageMs >= 0 && ageMs <= POSITION_RECONCILIATION_MAX_AGE_MS) return null;
  return deny('POSITION_RECONCILIATION_UNRESOLVED', `reconciliation is ${ageMs}ms old, TTL is ${POSITION_RECONCILIATION_MAX_AGE_MS}ms`);
}

export function checkIntent(intent: PolyOrderIntent): PolyRiskVerdict | null {
  if (!intent.tokenId) return deny('INVALID_INTENT', 'intent has no tokenId');
  if (intent.side !== 'buy' && intent.side !== 'sell') return deny('INVALID_INTENT', `intent side ${String(intent.side)} is not buy or sell`);
  if (!VALID_ORDER_TYPES.has(intent.orderType)) return deny('INVALID_INTENT', `intent orderType ${String(intent.orderType)} is unsupported`);
  if (!isNumber(intent.price) || intent.price <= 0 || intent.price >= 1) return deny('INVALID_INTENT', 'intent price must be strictly inside (0, 1)');
  if (!isNumber(intent.size) || intent.size <= 0) return deny('INVALID_INTENT', 'intent size must be a positive finite number');
  return null;
}

export function checkPortfolioKelly(
  intent: PolyOrderIntent,
  kellyInput: PolyPortfolioKellyRiskState | 'unknown' | undefined,
): PolyRiskVerdict | null {
  if (kellyInput === undefined) return null;
  const kelly = resolved(kellyInput);
  if (!kelly || typeof kelly.frozen !== 'boolean') return deny('UNRESOLVED_STATE', 'portfolioKelly state or frozen flag is unresolved');
  if (typeof kelly.tokenId !== 'string' || !kelly.tokenId.trim() || kelly.tokenId === 'unknown' || kelly.tokenId !== intent.tokenId) {
    return deny('UNRESOLVED_STATE', `portfolioKelly resolved for token ${String(kelly.tokenId)}, not ${intent.tokenId}`);
  }
  const { umaDisputedNavPct, portfolioDrawdownPct, navUsd, tokenCapUsd, currentTokenExposureUsd, projectedClusterWorstCaseLossUsd, maxClusterWorstCaseLossUsd } = kelly;
  const validCapOverride = maxClusterWorstCaseLossUsd === undefined || (isNumber(maxClusterWorstCaseLossUsd) && maxClusterWorstCaseLossUsd > 0);
  if (
    !isNumber(umaDisputedNavPct) || umaDisputedNavPct < 0 ||
    !isNumber(portfolioDrawdownPct) || portfolioDrawdownPct < 0 ||
    !isNumber(navUsd) || navUsd <= 0 ||
    !isNumber(tokenCapUsd) || tokenCapUsd < 0 ||
    !isNumber(currentTokenExposureUsd) || currentTokenExposureUsd < 0 ||
    !isNumber(projectedClusterWorstCaseLossUsd) || projectedClusterWorstCaseLossUsd < 0 ||
    !validCapOverride
  ) {
    return deny('UNRESOLVED_STATE', 'portfolioKelly contains an unknown, NaN, or invalid numeric field');
  }
  const intentNotional = intent.price * intent.size;
  if (!isNumber(intentNotional)) return deny('INVALID_INTENT', 'order notional is not a finite number');
  const navTailCapUsd = CLUSTER_TAIL_LOSS_MAX_NAV_FRACTION * navUsd;
  const clusterCapUsd = maxClusterWorstCaseLossUsd !== undefined ? Math.min(maxClusterWorstCaseLossUsd, navTailCapUsd) : navTailCapUsd;
  // Polymarket CLOB V2 has no naked short-selling; a `sell` within held long exposure (`<= currentTokenExposureUsd`)
  // disposes ERC-1155 shares (`REDUCE_ONLY` exit), while still enforcing the cluster tail-loss ceiling.
  if (intent.side === 'sell' && currentTokenExposureUsd > 0 && intentNotional <= currentTokenExposureUsd) {
    if (projectedClusterWorstCaseLossUsd > clusterCapUsd) {
      return deny('CLUSTER_TAIL_LOSS_ABOVE_CAP', `projected cluster tail loss $${projectedClusterWorstCaseLossUsd.toFixed(2)} exceeds cap $${clusterCapUsd.toFixed(2)}`);
    }
    return null;
  }
  if (umaDisputedNavPct > PORTFOLIO_UMA_DISPUTE_MAX_NAV_PCT) {
    return deny('UMA_DISPUTE_LOCKUP_HALT', `UMA disputed capital ${umaDisputedNavPct.toFixed(2)}% exceeds ${PORTFOLIO_UMA_DISPUTE_MAX_NAV_PCT}% NAV cap`);
  }
  if (kelly.frozen || portfolioDrawdownPct >= PORTFOLIO_KELLY_DRAWDOWN_FREEZE_PCT) {
    return deny('PORTFOLIO_KELLY_FROZEN', `portfolio Kelly disbursements frozen (drawdown ${portfolioDrawdownPct.toFixed(2)}%)`);
  }
  if (currentTokenExposureUsd + intentNotional > tokenCapUsd) {
    return deny('TOKEN_KELLY_CAP_EXCEEDED', `projected token exposure $${(currentTokenExposureUsd + intentNotional).toFixed(2)} exceeds Kelly cap $${tokenCapUsd.toFixed(2)}`);
  }
  if (projectedClusterWorstCaseLossUsd > clusterCapUsd) {
    return deny('CLUSTER_TAIL_LOSS_ABOVE_CAP', `projected cluster tail loss $${projectedClusterWorstCaseLossUsd.toFixed(2)} exceeds cap $${clusterCapUsd.toFixed(2)}`);
  }
  return null;
}
