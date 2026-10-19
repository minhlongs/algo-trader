/**
 * Rolling P&L computation for Qwen Drawdown Monitor.
 *
 * @module desk/wiring/qwen-drawdown-pnl
 */

import { query } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';

/** Rolling window for P&L calculation */
export const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Compute rolling 24h P&L for a given source from paper_trades_v3.
 * Returns pnl_pct as a decimal (e.g. -0.06 = -6%).
 * Returns null if no closed trades in window (no breach possible).
 */
export async function computeRollingPnl(
  source: string,
  windowMs = ROLLING_WINDOW_MS
): Promise<{ pnlPct: number | null; totalSize: number; totalPnl: number }> {
  const windowStart = Date.now() - windowMs;

  try {
    const result = await query<{ total_size: number | null; total_pnl: number | null }>(
      `SELECT
         COALESCE(SUM(size_usd), 0)  AS total_size,
         COALESCE(SUM(pnl), 0)       AS total_pnl
       FROM paper_trades_v3
       WHERE source = $1
         AND status = 'closed'
         AND closed_at >= $2`,
      [source, windowStart]
    );

    const totalSize = Number(result.rows[0]?.total_size ?? 0);
    const totalPnl = Number(result.rows[0]?.total_pnl ?? 0);

    if (totalSize === 0) {
      return { pnlPct: null, totalSize: 0, totalPnl: 0 };
    }

    return { pnlPct: totalPnl / totalSize, totalSize, totalPnl };
  } catch (err) {
    logger.error('[QwenDrawdown] computeRollingPnl DB error', { err });
    return { pnlPct: null, totalSize: 0, totalPnl: 0 };
  }
}
