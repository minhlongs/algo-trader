/**
 * Shared flag parsing for the leaderboard scripts.
 *
 * `--csv-dir` and `--doc` let the tests render into a throwaway directory; the
 * defaults are the real repo paths so normal CLI use needs no arguments.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, derived from this file's location under `<root>/scripts/lib/`. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface LeaderboardPaths {
  /** Directory holding `reports/backtest-results.csv`. */
  csvDir: string;
  /** Absolute path of the markdown file to write or compare. */
  docPath: string;
}

/** Value of `--<flag>` from argv, or null when absent. */
function flagValue(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

/** Resolve the CSV directory and doc path for this invocation. */
export function resolveLeaderboardPaths(argv: string[] = process.argv): LeaderboardPaths {
  const csvDir = flagValue(argv, '--csv-dir') ?? REPO_ROOT;
  const docPath = flagValue(argv, '--doc') ?? resolve(REPO_ROOT, 'docs', 'backtest-leaderboard.md');

  return { csvDir, docPath };
}

export { REPO_ROOT };
