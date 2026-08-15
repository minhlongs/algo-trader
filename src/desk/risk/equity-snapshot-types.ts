/**
 * Equity Snapshot types and helpers
 * Extracted from equity-snapshot-manager.ts for modularity
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EquitySnapshot {
  id: number;
  timestamp: number;
  totalEquity: number;
  cashBalance: number;
  unrealizedPnl: number;
  realizedPnlDaily: number;
  openPositions: number;
  drawdownPct: number;
  metadata: Record<string, unknown>;
}

export interface SnapshotInput {
  totalEquity: number;
  cashBalance: number;
  unrealizedPnl: number;
  realizedPnlDaily: number;
  openPositions: number;
  drawdownPct: number;
  metadata?: Record<string, unknown>;
}

export interface EquitySnapshotManagerOptions {
  /** Minimum interval between snapshots in ms (default 60000 = 1 min) */
  minIntervalMs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function rowToSnapshot(row: Record<string, unknown>): EquitySnapshot {
  return {
    id: row.id as number,
    timestamp: row.timestamp as number,
    totalEquity: parseFloat(row.total_equity as string),
    cashBalance: parseFloat(row.cash_balance as string),
    unrealizedPnl: parseFloat(row.unrealized_pnl as string),
    realizedPnlDaily: parseFloat(row.realized_pnl_daily as string),
    openPositions: row.open_positions as number,
    drawdownPct: parseFloat(row.drawdown_pct as string),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
