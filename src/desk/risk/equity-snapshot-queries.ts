/**
 * Equity Snapshot DB queries
 * Extracted from equity-snapshot-manager.ts for modularity
 */

import { getDbClient } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';
import type { EquitySnapshot } from './equity-snapshot-types';
import { rowToSnapshot } from './equity-snapshot-types';

const COLS = 'id, timestamp, total_equity, cash_balance, unrealized_pnl, realized_pnl_daily, open_positions, drawdown_pct, metadata';

async function withClient<T>(fn: (q: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>): Promise<T> {
  const client = await getDbClient().connect();
  try { return await fn(client.query.bind(client)); } finally { client.release(); }
}

async function safeQuery<T>(fallback: T, fn: (q: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>): Promise<T> {
  try { return await withClient(fn); } catch (err) {
    logger.error('[EquitySnapshot] query failed', { cause: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}

export const queryRecent = (limit: number): Promise<EquitySnapshot[]> =>
  safeQuery([], (q) => q(`SELECT ${COLS} FROM equity_snapshots ORDER BY timestamp DESC LIMIT $1`, [limit]).then(r => r.rows.map(rowToSnapshot)));

export const queryRange = (fromMs: number, toMs: number): Promise<EquitySnapshot[]> =>
  safeQuery([], (q) => q(`SELECT ${COLS} FROM equity_snapshots WHERE timestamp >= $1 AND timestamp <= $2 ORDER BY timestamp ASC`, [fromMs, toMs]).then(r => r.rows.map(rowToSnapshot)));

export const queryDailyReturns = (days: number): Promise<number[]> =>
  safeQuery([], async (q) => {
    const r = await q(
      `SELECT DISTINCT ON (date_trunc('day', to_timestamp(timestamp / 1000))) total_equity, date_trunc('day', to_timestamp(timestamp / 1000)) as day FROM equity_snapshots WHERE timestamp >= $1 ORDER BY day DESC, timestamp DESC`,
      [Date.now() - days * 86_400_000],
    );
    const eq = r.rows.map((row: Record<string, unknown>) => parseFloat(row.total_equity as string)).filter(v => v > 0);
    return eq.slice(1).map((v, i) => (eq[i] - v) / v);
  });

export const queryPrune = (maxDays: number): Promise<number> =>
  safeQuery(0, async (q) => {
    const r = await q('DELETE FROM equity_snapshots WHERE timestamp < $1', [Date.now() - maxDays * 86_400_000]);
    return r.rowCount ?? 0;
  });
