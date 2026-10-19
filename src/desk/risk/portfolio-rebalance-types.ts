/**
 * Portfolio Rebalance Guard Types
 *
 * @module desk/risk/portfolio-rebalance-types
 */

export interface AllocationTarget {
  tokenId: string;
  targetPct: number;  // 0-1, e.g. 0.25 = 25%
}

export interface PositionSnapshot {
  tokenId: string;
  sizeUsdc: number;
}

export interface RebalanceGuardConfig {
  /** Maximum drift from target before alerting (default 0.05 = 5%) */
  maxDriftPct: number;
  /** Minimum cooldown between rebalance actions in ms (default 300_000 = 5 min) */
  rebalanceCooldownMs: number;
  /** Maximum number of rebalances per day (default 12) */
  maxDailyRebalances: number;
}

export interface DriftedPosition {
  tokenId: string;
  targetPct: number;
  actualPct: number;
  drift: number;
}

export interface RebalanceStatus {
  drift: number;          // current max drift across all positions
  needsRebalance: boolean;
  lastRebalanceAt: number | null;
  rebalancesToday: number;
  driftedPositions: DriftedPosition[];
}

export interface RebalanceGuardResult {
  allowed: boolean;
  reason?: string;
  status: RebalanceStatus;
}

export const DEFAULT_REBALANCE_GUARD_CONFIG: RebalanceGuardConfig = {
  maxDriftPct: 0.05,
  rebalanceCooldownMs: 300_000,
  maxDailyRebalances: 12,
};
