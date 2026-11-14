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

export interface PolyPortfolioKellyRiskState {
  /** Token identity this Kelly limit row was resolved for (must match `intent.tokenId`). */
  tokenId: string | 'unknown';
  /** True when portfolio allocator kill-switch froze all new disbursements. */
  frozen: boolean | 'unknown';
  /** Active UMA-disputed locked capital as percent of NAV (10 means 10%). */
  umaDisputedNavPct: number | 'unknown';
  /** Portfolio-level peak-to-trough drawdown in percent (5.0 means 5.0%). */
  portfolioDrawdownPct: number | 'unknown';
  /** Total portfolio NAV in USDC/pUSD. */
  navUsd: number | 'unknown';
  /** Lockup-adjusted Kelly notional cap for `intent.tokenId` in USDC. */
  tokenCapUsd: number | 'unknown';
  /** Existing open notional exposure on `intent.tokenId` in USDC. */
  currentTokenExposureUsd: number | 'unknown';
  /** Worst-case cluster loss in USDC after including this order intent. */
  projectedClusterWorstCaseLossUsd: number | 'unknown';
  /** Optional explicit cluster loss ceiling in USDC (defaults to 3% of NAV). */
  maxClusterWorstCaseLossUsd?: number | 'unknown';
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
  /** Optional multi-market Lockup-Adjusted Kelly limits; fail-closed when supplied. */
  portfolioKelly?: PolyPortfolioKellyRiskState | Unresolved;
}

export const MARKET_DATA_MAX_AGE_MS = 5_000;
export const POSITION_RECONCILIATION_MAX_AGE_MS = 60_000;
/** Polymarket rejects resting GTC/GTD orders smaller than 5 shares. */
export const MIN_RESTING_ORDER_SIZE_SHARES = 5;
/** Auto-halt threshold: at or beyond this drawdown, no new order is allowed. */
export const DRAWDOWN_AUTO_HALT_PCT = 3.0;
/** Freeze new disbursements when active UMA-disputed capital exceeds 10% of NAV. */
export const PORTFOLIO_UMA_DISPUTE_MAX_NAV_PCT = 10.0;
/** Freeze new disbursements when portfolio drawdown reaches or exceeds 5.0% of NAV. */
export const PORTFOLIO_KELLY_DRAWDOWN_FREEZE_PCT = 5.0;
/** Hard cluster worst-case tail-loss cap as a fraction of NAV (3.0%). */
export const CLUSTER_TAIL_LOSS_MAX_NAV_FRACTION = 0.03;

export type PolyRiskBlockReason =
  | 'KILL_SWITCH_ACTIVE'
  | 'KILL_SWITCH_STATE_UNKNOWN'
  | 'STALE_MARKET_DATA'
  | 'UNKNOWN_FEE_SCHEDULE'
  | 'POSITION_RECONCILIATION_UNRESOLVED'
  | 'ORDER_BELOW_MIN_SIZE'
  | 'NOTIONAL_ABOVE_CAP'
  | 'DRAWDOWN_AUTO_HALT'
  | 'PORTFOLIO_KELLY_FROZEN'
  | 'UMA_DISPUTE_LOCKUP_HALT'
  | 'TOKEN_KELLY_CAP_EXCEEDED'
  | 'CLUSTER_TAIL_LOSS_ABOVE_CAP'
  | 'INVALID_INTENT'
  /** Default deny: state absent, malformed, or a required value never established. */
  | 'UNRESOLVED_STATE';

export type PolyRiskVerdict =
  | { allowed: true }
  | { allowed: false; reason: PolyRiskBlockReason; detail: string };
