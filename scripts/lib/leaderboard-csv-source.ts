/**
 * Leaderboard CSV source seam.
 *
 * The generator MUST read the CSV through the parser the live API already uses
 * (`src/platform/api/routes/leaderboard-builder.ts`) so the published doc and
 * `GET /api/v1/leaderboard` can never disagree — no second CSV parser is written.
 *
 * That parser is TypeScript with extensionless relative imports, so it is loaded
 * in a `tsx` child process (a repo devDependency). This module owns that
 * indirection: callers get back plain parsed rows and never deal with tsx.
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LeaderboardCsvRow {
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

/** Row shape as it arrives from the child: profit_factor may be the sentinel string. */
type RawCsvRow = Omit<LeaderboardCsvRow, 'profit_factor'> & { profit_factor: number | string };

/** Child that loads the real parser and prints its rows as one JSON line. */
const WORKER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'leaderboard-csv-worker.ts');

/** Must match the sentinel used by `leaderboard-csv-worker.ts`. */
const INFINITE_PF_SENTINEL = '__infinite_pf__';

/** Repo root — the parser resolves `reports/backtest-results.csv` against cwd. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Read the backtest CSV through the API's own parser.
 *
 * `csvDir` is the directory holding the `reports/backtest-results.csv` to read —
 * the repo itself by default, a sandbox when a test injects its own CSV. It is
 * passed separately from the process `cwd` because the `tsx` loader (and every
 * Node module resolution inside it) must still resolve from the repo root.
 *
 * @throws when the parser child fails, exits non-zero, or emits unusable output.
 */
export function readLeaderboardCsv(csvDir: string = REPO_ROOT): LeaderboardCsvRow[] {
  const run = spawnSync(
    process.execPath,
    ['--import', 'tsx', WORKER_PATH, '--csv-dir', csvDir],
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (run.error) {
    throw new Error(`[leaderboard] could not launch the CSV parser — ${run.error.message}`);
  }

  const stdout = (run.stdout ?? '').trim();
  if (run.status !== 0) {
    const detail = (run.stderr ?? '').trim().split('\n').slice(-5).join(' | ');
    throw new Error(`[leaderboard] CSV parser exited ${run.status ?? 'null'} — ${detail}`);
  }

  if (!stdout) {
    throw new Error('[leaderboard] CSV parser produced no output');
  }

  const parsed = JSON.parse(stdout) as RawCsvRow[];
  if (!Array.isArray(parsed)) {
    throw new Error('[leaderboard] CSV parser did not return a row array');
  }

  // Restore the infinite profit factor that JSON could not carry across the child
  // boundary. Any other unexpected string stays 0 — the parser never emits one.
  return parsed.map((row) => ({
    ...row,
    profit_factor:
      row.profit_factor === INFINITE_PF_SENTINEL
        ? Infinity
        : typeof row.profit_factor === 'number'
          ? row.profit_factor
          : 0,
  }));
}
