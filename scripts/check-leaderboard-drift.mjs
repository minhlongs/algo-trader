#!/usr/bin/env node

/**
 * CI guard — `docs/backtest-leaderboard.md` must match the generator's output.
 *
 * The doc is a generated artifact. If `reports/backtest-results.csv` changes
 * without the doc being regenerated, this fails so the public leaderboard can
 * never advertise numbers the CSV does not support.
 *
 * Usage:
 *   node scripts/check-leaderboard-drift.mjs [--csv-dir <dir>] [--doc <file>]
 *
 * Exit 0 = doc in sync. Exit 1 = doc missing, stale, or hand-edited.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveLeaderboardPaths } from './lib/leaderboard-script-args.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = resolve(ROOT, 'scripts', 'generate-leaderboard.mjs');
const { csvDir, docPath: DOC_PATH } = resolveLeaderboardPaths(process.argv);

const run = spawnSync(
  process.execPath,
  ['--import', 'tsx', GENERATOR, '--check', '--csv-dir', csvDir, '--doc', DOC_PATH],
  { cwd: ROOT, encoding: 'utf-8' },
);

// Surface the generator's own diagnostics first.
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);

if (run.status === 0) {
  process.exit(0);
}

// A drift failure is only actionable if you can see the delta.
try {
  console.error(`  Committed doc is ${readFileSync(DOC_PATH, 'utf-8').split('\n').length} lines and no longer matches the CSV.`);
  console.error('  Fix: `npm run generate:leaderboard` then commit docs/backtest-leaderboard.md.');
} catch {
  // The generator already reported the missing file.
}

process.exit(run.status ?? 1);
