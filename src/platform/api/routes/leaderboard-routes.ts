/**
 * Leaderboard Routes
 * GET /api/v1/leaderboard — Returns strategy rankings merged from
 * prediction accuracy data (win rate by strategy) and backtest CSV
 * (Sharpe, P&L, drawdown, profit factor).
 *
 * Tier gating:
 *   FREE  — view leaderboard (no sort)
 *   PRO+  — sort, filter, export CSV
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  buildLeaderboard,
  type LeaderboardEntry,
} from './leaderboard-builder';

export type { LeaderboardEntry };

/** Allowed sort fields mapped to their key in LeaderboardEntry */
const SORT_FIELDS: Record<string, keyof LeaderboardEntry> = {
  winRate: 'winRate',
  sharpe: 'sharpeRatio',
  pnl: 'sharpeRatio',
  drawdown: 'maxDrawdown',
};

export const leaderboardRouter: RouterType = Router();

/**
 * GET /api/v1/leaderboard
 *
 * Query params:
 *   sort  — winRate | sharpe | pnl | drawdown (PRO+ only)
 *   order — asc | desc (default: desc)
 *   limit — max entries (default: 50, max: 200)
 */
leaderboardRouter.get('/', requireTier('FREE'), (req: Request, res: Response) => {
  try {
    const entries = buildLeaderboard();

    const sortParam = (req.query.sort as string)?.toLowerCase();
    const orderParam = (req.query.order as string)?.toLowerCase();
    const limitParam = parseInt(req.query.limit as string, 10);

    const order = orderParam === 'asc' ? 1 : -1;
    const limit = Math.min(Math.max(limitParam || 50, 1), 200);

    if (sortParam && SORT_FIELDS[sortParam]) {
      const license = req.license;
      const tier = (license?.tier as string) ?? 'FREE';
      const isPro = ['PRO', 'ENTERPRISE', 'MASTER'].includes(tier);

      if (!isPro) {
        const sliced = entries.slice(0, limit);
        res.json({ data: sliced, count: sliced.length, total: entries.length });
        return;
      }

      const sortKey = SORT_FIELDS[sortParam];
      entries.sort((a, b) => {
        const aVal = a[sortKey] as number;
        const bVal = b[sortKey] as number;
        return (aVal - bVal) * order;
      });
    }

    const sliced = entries.slice(0, limit);
    res.json({ data: sliced, count: sliced.length, total: entries.length });
  } catch (err) {
    logger.error('[Leaderboard] Handler error', { err: String(err) });
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});
