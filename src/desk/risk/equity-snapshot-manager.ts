/**
 * Equity Snapshot Manager
 *
 * Records periodic equity snapshots to PostgreSQL for historical
 * drawdown analysis, VaR backtesting, and equity curve visualization.
 *
 * Throttles writes to one snapshot per MIN_INTERVAL_MS (default 60s)
 * to avoid overwhelming the database during high-frequency trading.
 */

import { getDbClient } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { EquitySnapshot, SnapshotInput, EquitySnapshotManagerOptions } from './equity-snapshot-types';
import { queryRecent, queryRange, queryDailyReturns, queryPrune } from './equity-snapshot-queries';

export type { EquitySnapshot, SnapshotInput, EquitySnapshotManagerOptions };

const MIN_INTERVAL_MS = 60_000;
const RETENTION_DAYS = 90;

export class EquitySnapshotManager {
  private lastSnapshotTime = 0;
  private minIntervalMs: number;
  private retentionDays: number;

  constructor(options?: EquitySnapshotManagerOptions) {
    this.minIntervalMs = options?.minIntervalMs ?? MIN_INTERVAL_MS;
    this.retentionDays = RETENTION_DAYS;
  }

  /** Record a snapshot — throttled to once per minIntervalMs */
  async recordSnapshot(input: SnapshotInput): Promise<EquitySnapshot | null> {
    const now = Date.now();
    if (now - this.lastSnapshotTime < this.minIntervalMs) return null;

    try {
      const pool = getDbClient();
      const client = await pool.connect();
      try {
        const result = await client.query(
          `INSERT INTO equity_snapshots (timestamp, total_equity, cash_balance, unrealized_pnl, realized_pnl_daily, open_positions, drawdown_pct, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, timestamp, total_equity, cash_balance, unrealized_pnl, realized_pnl_daily, open_positions, drawdown_pct, metadata`,
          [now, input.totalEquity, input.cashBalance, input.unrealizedPnl, input.realizedPnlDaily, input.openPositions, input.drawdownPct, JSON.stringify(input.metadata ?? {})],
        );
        this.lastSnapshotTime = now;
        const row = result.rows[0] as Record<string, unknown>;
        return {
          id: row.id as number, timestamp: row.timestamp as number,
          totalEquity: parseFloat(row.total_equity as string), cashBalance: parseFloat(row.cash_balance as string),
          unrealizedPnl: parseFloat(row.unrealized_pnl as string), realizedPnlDaily: parseFloat(row.realized_pnl_daily as string),
          openPositions: row.open_positions as number, drawdownPct: parseFloat(row.drawdown_pct as string),
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        };
      } finally { client.release(); }
    } catch (err) {
      logger.error('[EquitySnapshot] Failed to record snapshot', { cause: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /** Get recent snapshots (most recent first) */
  async getRecent(limit = 100): Promise<EquitySnapshot[]> { return queryRecent(limit); }

  /** Get snapshots within a time range (inclusive) */
  async getRange(fromMs: number, toMs: number): Promise<EquitySnapshot[]> { return queryRange(fromMs, toMs); }

  /** Compute daily returns from equity snapshots */
  async getDailyReturns(days = 30): Promise<number[]> { return queryDailyReturns(days); }

  /** Prune snapshots older than retentionDays */
  async pruneOldSnapshots(): Promise<number> { return queryPrune(this.retentionDays); }
}

let instance: EquitySnapshotManager | null = null;
export function getEquitySnapshotManager(options?: EquitySnapshotManagerOptions): EquitySnapshotManager {
  if (!instance) instance = new EquitySnapshotManager(options);
  return instance;
}
