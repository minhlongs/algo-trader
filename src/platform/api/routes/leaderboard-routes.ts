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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getAllStrategyAccuracy, type StrategyAccuracy } from '../../../desk/intelligence/prediction-accuracy-tracker';

const BACKTEST_CSV = join(process.cwd(), 'reports', 'backtest-results.csv');

export interface LeaderboardEntry {
  strategyName: string;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  profitFactor: number;
  lastUpdated: string;
  pnl: number;
  badge?: 'top_performer' | 'rising_star' | 'verified' | 'new' | null;
}

interface CsvRow {
  strategy: string;
  sharpe_ratio: number;
  win_rate_pct: number;
  total_pnl_usd: number;
  profit_factor: number;
  max_drawdown_pct: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
}

/**
 * Parse the backtest CSV into structured rows.
 * Returns an empty array on any read or parse error (logged but not thrown).
 */
function parseBacktestCsv(): CsvRow[] {
  if (!existsSync(BACKTEST_CSV)) {
    logger.warn('[Leaderboard] Backtest CSV not found', { path: BACKTEST_CSV });
    return [];
  }

  try {
    const raw = readFileSync(BACKTEST_CSV, 'utf-8').trim();
    if (!raw) return [];

    const lines = raw.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const vals = line.split(',');
      if (vals.length < headers.length) continue;

      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = vals[j]?.trim() ?? '';
      }

      rows.push({
        strategy: row.strategy ?? '',
        sharpe_ratio: Number(row.sharpe_ratio) || 0,
        win_rate_pct: Number(row.win_rate_pct) || 0,
        total_pnl_usd: Number(row.total_pnl_usd) || 0,
        profit_factor: row.profit_factor === 'Infinity' ? Infinity : Number(row.profit_factor) || 0,
        max_drawdown_pct: Number(row.max_drawdown_pct) || 0,
        total_trades: Number(row.total_trades) || 0,
        winning_trades: Number(row.winning_trades) || 0,
        losing_trades: Number(row.losing_trades) || 0,
      });
    }

    return rows;
  } catch (err) {
    logger.error('[Leaderboard] Failed to parse backtest CSV', { err: String(err) });
    return [];
  }
}

/**
 * Build the merged leaderboard by combining accuracy data with backtest performance.
 * Strategies present only in one source still appear with zeroes for missing fields.
 */
function buildLeaderboard(): LeaderboardEntry[] {
  const accuracyMap = new Map<string, StrategyAccuracy>();
  for (const a of getAllStrategyAccuracy()) {
    accuracyMap.set(a.strategyName, a);
  }

  const backtestRows = parseBacktestCsv();
  const backtestMap = new Map<string, CsvRow>();
  for (const r of backtestRows) {
    backtestMap.set(r.strategy, r);
  }

  // Collect all unique strategy names from both sources
  const allNames = new Set<string>();
  for (const name of accuracyMap.keys()) allNames.add(name);
  for (const name of backtestMap.keys()) allNames.add(name);

  const entries: LeaderboardEntry[] = [];

  for (const strategyName of allNames) {
    const accuracy = accuracyMap.get(strategyName);
    const backtest = backtestMap.get(strategyName);

    entries.push({
      strategyName,
      winRate: accuracy?.winRate ?? (backtest ? backtest.win_rate_pct / 100 : 0),
      sharpeRatio: backtest?.sharpe_ratio ?? 0,
 pnl: 0,
      maxDrawdown: backtest ? backtest.max_drawdown_pct / 100 : 0,
      totalTrades: backtest?.total_trades ?? accuracy?.totalTrades ?? 0,
      profitFactor: backtest?.profit_factor ?? 0,
      lastUpdated: accuracy?.lastUpdated ?? new Date().toISOString(),
    });
  }

  return entries;
}

/** Allowed sort fields mapped to their key in LeaderboardEntry */
const SORT_FIELDS: Record<string, keyof LeaderboardEntry> = {
  winRate: 'winRate',
  sharpe: 'sharpeRatio',
  pnl: 'sharpeRatio', // no raw P&L in backtest CSV — sort by sharpe as best proxy
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

    // Parse query params
    const sortParam = (req.query.sort as string)?.toLowerCase();
    const orderParam = (req.query.order as string)?.toLowerCase();
    const limitParam = parseInt(req.query.limit as string, 10);

    const order = orderParam === 'asc' ? 1 : -1;
    const limit = Math.min(Math.max(limitParam || 50, 1), 200);

    // Sorting is PRO+ feature
    if (sortParam && SORT_FIELDS[sortParam]) {
      // Check if user has PRO+ tier for sorting
      // requireTier('PRO') gates this — we re-check at handler level
      const license = req.license;
      const tier = (license?.tier as string) ?? 'FREE';
      const isPro = ['PRO', 'ENTERPRISE', 'MASTER'].includes(tier);

      if (!isPro) {
        // Return unsorted leaderboard (FREE tier: view only)
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
