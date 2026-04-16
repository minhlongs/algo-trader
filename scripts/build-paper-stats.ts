/**
 * build-paper-stats.ts
 * ---------------------------------------------------------------------------
 * Phase 02 generator — produces `dashboard/public/paper-stats.json` snapshot
 * from the paper-trade SQLite database on the M1 Max box. Run via SSH:
 *
 *   ssh m1max-cf "cd ~/algo-trader && pnpm exec ts-node scripts/build-paper-stats.ts"
 *
 * Output shape (matches dashboard/public/paper-stats.json):
 *   { trades, batches, edge_avg_pct, actionable_pct, last_updated, source, note }
 *
 * Phase 03 replaces this script with a live D1 query from a Worker.
 *
 * Constraints:
 *   - better-sqlite3 is an OPTIONAL dep on the root repo. If the module is
 *     missing OR the expected `paper_trades` table is absent, we fall back to
 *     a well-known placeholder so the build never fails.
 *   - No network calls. Pure local read.
 */

import fs from 'node:fs';
import path from 'node:path';

interface PaperStats {
  trades: number;
  batches: number;
  edge_avg_pct: number;
  actionable_pct: number;
  last_updated: string;
  source: 'paper' | 'paper-placeholder';
  note: string;
}

// Fallback snapshot matches the public manifesto (150 trades, 3 batches).
const PLACEHOLDER: PaperStats = {
  trades: 150,
  batches: 3,
  edge_avg_pct: 18.3,
  actionable_pct: 55,
  last_updated: new Date().toISOString().slice(0, 10),
  source: 'paper-placeholder',
  note: 'pre-resolution edge, not profit',
};

const REPO_ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'algo-trade.db');
const OUT_PATH = path.join(REPO_ROOT, 'dashboard', 'public', 'paper-stats.json');

function loadBetterSqlite(): unknown | null {
  try {
    // Deliberate dynamic require — dep may be absent in CI/dashboard-only checkouts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3');
  } catch {
    return null;
  }
}

interface PaperRow {
  trades: number;
  batches: number;
  edge_avg: number | null;
  actionable: number | null;
}

function queryPaperStats(dbPath: string): PaperStats | null {
  const Database = loadBetterSqlite() as
    | (new (p: string, opts?: unknown) => unknown)
    | null;
  if (!Database) return null;
  if (!fs.existsSync(dbPath)) return null;

  const db = new Database(dbPath, { readonly: true }) as {
    prepare: (sql: string) => { get: <T>() => T | undefined };
    close: () => void;
  };

  try {
    // Verify the table exists before querying — older DBs may not have it.
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='paper_trades'",
      )
      .get<{ name: string }>();
    if (!tableCheck) return null;

    const row = db
      .prepare(
        `SELECT
           COUNT(*) AS trades,
           COUNT(DISTINCT batch_id) AS batches,
           AVG(edge_pct) AS edge_avg,
           AVG(CASE WHEN actionable = 1 THEN 1.0 ELSE 0.0 END) * 100 AS actionable
         FROM paper_trades`,
      )
      .get<PaperRow>();
    if (!row || row.trades === 0) return null;

    return {
      trades: row.trades,
      batches: row.batches,
      edge_avg_pct: Number((row.edge_avg ?? 0).toFixed(1)),
      actionable_pct: Math.round(row.actionable ?? 0),
      last_updated: new Date().toISOString().slice(0, 10),
      source: 'paper',
      note: 'pre-resolution edge, not profit',
    };
  } finally {
    db.close();
  }
}

function main(): void {
  const live = queryPaperStats(DB_PATH);
  const stats = live ?? PLACEHOLDER;

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');

  const label = live ? 'live' : 'placeholder';
  // eslint-disable-next-line no-console
  console.log(`[build-paper-stats] wrote ${OUT_PATH} (source=${label})`);
}

main();
