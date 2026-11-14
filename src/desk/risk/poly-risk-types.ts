/**
 * Shared types for the Polymarket fail-closed pre-trade risk engine.
 *
 * Fail-closed is encoded in the type system, not in a comment: every state
 * field a check depends on is `T | 'unknown' | undefined`. A caller that has
 * not positively established a value must pass `'unknown'`, and the engine
 * blocks. There is deliberately no `boolean` shortcut that defaults to "fine".
 */

export type Unresolved = 'unknown' | undefined;

export interface PolyOrderIntent {
  tokenId: string;
  side: 'buy' | 'sell';
  /** Limit price per share in USDC. Polymarket shares settle in (0, 1). */
  price: number;
  /** Order size in shares. */
  size: number;
  orderType: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  /** Required for GTD; unix epoch seconds strictly after `nowMs / 1000`. */
  expiration?: number;
}

export interface PolyMarketDataState {
  /** Epoch ms of the newest book/quote this intent was priced against. */
  observedAtMs: number | 'unknown';
}

/**
 * A schedule resolved for a *different* token is unresolved for this one, so
 * the token id is part of the state rather than a caller convention.
 * `rate: null` means the venue reported `feesEnabled: false` — that is a known
 * fact (exempt), not a missing value.
 */
export interface PolyFeeScheduleState {
  tokenId: string | 'unknown';
  rate: number | null | 'unknown';
  /** Fee curve exponent. Only irrelevant when `rate` is null (exempt market). */
  exponent: number | 'unknown';
}

export interface PolyPositionReconciliationState {
  /** True only when open positions were matched against venue state. */
  reconciled: boolean | 'unknown';
  reconciledAtMs: number | 'unknown';
  openPositionCount: number | 'unknown';
}

export interface PolyRiskBudgetState {
  /** Per-order notional ceiling in USDC. */
  maxNotionalUsd: number | 'unknown';
  /** Current peak-to-trough drawdown in percent (2.5 means 2.5%). */
  currentDrawdownPct: number | 'unknown';
}

export type PolyKillSwitchState = 'inactive' | 'active' | 'unknown' | undefined;

export interface PolyRiskState {
  /** Epoch ms supplied by the caller. The engine never reads a clock. */
  nowMs: number | 'unknown';
  killSwitch?: PolyKillSwitchState;
  marketData?: PolyMarketDataState | Unresolved;
  feeSchedule?: PolyFeeScheduleState | Unresolved;
  positionReconciliation?: PolyPositionReconciliationState | Unresolved;
  riskBudget?: PolyRiskBudgetState | Unresolved;
}

export const MARKET_DATA_MAX_AGE_MS = 5_000;
export const POSITION_RECONCILIATION_MAX_AGE_MS = 60_000;
/** Polymarket rejects resting GTC/GTD orders smaller than 5 shares. */
export const MIN_RESTING_ORDER_SIZE_SHARES = 5;
/** Auto-halt threshold: at or beyond this drawdown, no new order is allowed. */
export const DRAWDOWN_AUTO_HALT_PCT = 3.0;

export type PolyRiskBlockReason =
  | 'KILL_SWITCH_ACTIVE'
  | 'KILL_SWITCH_STATE_UNKNOWN'
  | 'STALE_MARKET_DATA'
  | 'UNKNOWN_FEE_SCHEDULE'
  | 'POSITION_RECONCILIATION_UNRESOLVED'
  | 'ORDER_BELOW_MIN_SIZE'
  | 'NOTIONAL_ABOVE_CAP'
  | 'DRAWDOWN_AUTO_HALT'
  | 'INVALID_INTENT'
  /** Default deny: state absent, malformed, or a required value never established. */
  | 'UNRESOLVED_STATE';

export type PolyRiskVerdict =
  | { allowed: true }
  | { allowed: false; reason: PolyRiskBlockReason; detail: string };
