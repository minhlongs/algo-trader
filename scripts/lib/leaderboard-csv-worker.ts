/**
 * CSV parser child process.
 *
 * Loads the backtest parser the live API uses and prints the parsed rows as a
 * single JSON line on stdout. Run via `node --import tsx` — see
 * `leaderboard-csv-source.ts` for why a child process is needed.
 *
 * `--csv-dir <dir>` selects which `reports/backtest-results.csv` to read (default
 * the repo root) so a test can inject a CSV of its own. The builder itself is
 * loaded by absolute path, so that choice can never redirect which parser runs.
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The one parser the live API uses — loaded by absolute path, never re-implemented. */
const BUILDER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'platform',
  'api',
  'routes',
  'leaderboard-builder',
);

/** JSON-safe stand-in for a profit factor with zero losing trades. */
const INFINITE_PF_SENTINEL = '__infinite_pf__';

const csvDirFlag = process.argv.indexOf('--csv-dir');
if (csvDirFlag !== -1 && process.argv[csvDirFlag + 1]) {
  process.chdir(process.argv[csvDirFlag + 1]);
}

const require = createRequire(BUILDER_PATH);
const { parseBacktestCsv } = require(BUILDER_PATH) as {
  parseBacktestCsv: () => Record<string, number | string>[];
};

const rows = parseBacktestCsv().map((row) => ({
  ...row,
  profit_factor: row.profit_factor === Infinity ? INFINITE_PF_SENTINEL : row.profit_factor,
}));

process.stdout.write(`${JSON.stringify(rows)}\n`);
