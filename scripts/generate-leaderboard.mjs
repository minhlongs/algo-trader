#!/usr/bin/env node

/**
 * Regenerate `docs/backtest-leaderboard.md` from `reports/backtest-results.csv`.
 *
 * Reads the CSV through the parser the live API uses
 * (`src/platform/api/routes/leaderboard-builder.ts`) — there is deliberately no
 * second CSV parser. The doc is a generated artifact: never hand-edit it.
 *
 * Usage:
 *   node scripts/generate-leaderboard.mjs [--check] [--csv-dir <dir>] [--doc <file>]
 *
 *   --check       exit 1 if the doc no longer matches the generator, without
 *                 writing. Used by CI (`npm run check:leaderboard`).
 *   --csv-dir     directory holding `reports/backtest-results.csv` (default: repo).
 *   --doc         markdown path to write or compare (default: repo doc).
 *                 Both let the tests render into a throwaway directory.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readLeaderboardCsv } from './lib/leaderboard-csv-source.ts';
import { renderLeaderboardDoc } from './lib/leaderboard-doc-renderer.ts';
import { resolveLeaderboardPaths } from './lib/leaderboard-script-args.ts';

const { csvDir, docPath: DOC_PATH } = resolveLeaderboardPaths(process.argv);

const checkOnly = process.argv.includes('--check');

let rows;
try {
  rows = readLeaderboardCsv(csvDir);
} catch (err) {
  console.error(`ERROR: ${err?.message ?? err}`);
  process.exit(1);
}

if (rows.length === 0) {
  console.error('ERROR: CSV parser returned zero rows — refusing to write an empty leaderboard.');
  process.exit(1);
}

const rendered = renderLeaderboardDoc(rows);

if (checkOnly) {
  let committed = null;
  try {
    committed = readFileSync(DOC_PATH, 'utf-8');
  } catch {
    console.error(`ERROR: ${DOC_PATH} is missing — run \`npm run generate:leaderboard\`.`);
    process.exit(1);
  }

  if (committed === rendered) {
    console.log(`  Leaderboard doc is in sync (${rows.length} CSV rows).`);
    process.exit(0);
  }

  console.error(`  LEADERBOARD DRIFT: ${DOC_PATH} does not match ${rendered.length}-byte generator output.`);
  console.error('  Run `npm run generate:leaderboard` and commit the result.');
  process.exit(1);
}

mkdirSync(resolve(DOC_PATH, '..'), { recursive: true });

const previous = (() => {
  try {
    return readFileSync(DOC_PATH, 'utf-8');
  } catch {
    return null;
  }
})();

writeFileSync(DOC_PATH, rendered);

if (previous === rendered) {
  console.log(`  Leaderboard doc already up to date (${rows.length} CSV rows, ${rendered.length} bytes).`);
} else {
  console.log(`  Leaderboard doc regenerated from ${rows.length} CSV rows (${rendered.length} bytes).`);
  console.log('  Generated artifact — do not edit docs/backtest-leaderboard.md by hand.');
}
