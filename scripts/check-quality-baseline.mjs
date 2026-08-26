#!/usr/bin/env node

/**
 * Quality Ratchet — checks current metrics against quality-baseline.json.
 * Exits 1 if any metric regresses below baseline thresholds.
 *
 * Usage:
 *   node scripts/check-quality-baseline.mjs [--coverage] [--tests] [--quality] [--all]
 *   Default: --all
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  collectFileLineCounts,
  evaluateOversizedFiles,
} from './oversized-file-check.mjs';
import { readVitestJsonSummary } from './vitest-summary-reader.mjs';
import {
  collectSourceFiles,
  countPatternLines,
  countBannedImports,
} from './static-quality-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(ROOT, 'quality-baseline.json');

// ---------------------------------------------------------------------------
// Load baseline
// ---------------------------------------------------------------------------
if (!existsSync(BASELINE_PATH)) {
  console.error('ERROR: quality-baseline.json not found at', BASELINE_PATH);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
console.log(`\n  Quality Ratchet v${baseline.version}  (${baseline.created})`);
console.log('  ' + '='.repeat(56));

// ---------------------------------------------------------------------------
// --prune-oversized-snapshot: prune-only maintenance of the violator snapshot.
// Rewrites quality.oversizedFileBaseline keeping ONLY entries that still
// exceed maxFileSizeLines. Can never add entries — adding debt requires a
// deliberate manual edit (protects updatePolicy "NEVER decrease thresholds").
// ---------------------------------------------------------------------------
if (process.argv.includes('--prune-oversized-snapshot')) {
  const snapshot = baseline.quality?.oversizedFileBaseline;
  if (!snapshot || typeof snapshot.violators !== 'object' || snapshot.violators === null) {
    console.error('ERROR: quality.oversizedFileBaseline.violators missing from baseline');
    process.exit(1);
  }
  const limit = baseline.quality.maxFileSizeLines;
  const current = collectFileLineCounts(ROOT);
  const currentByPath = new Map(current.map((f) => [f.path, f.lines]));

  const kept = {};
  const removed = [];
  for (const [path, baselineLines] of Object.entries(snapshot.violators)) {
    const currentLines = currentByPath.get(path);
    if (currentLines !== undefined && currentLines > limit) {
      kept[path] = currentLines;
    } else {
      removed.push(`${path} (baseline ${baselineLines} → now ${currentLines ?? 'deleted'})`);
    }
  }

  snapshot.violators = kept;
  snapshot.count = Object.keys(kept).length;
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');

  console.log(`\n  Pruned oversized-file snapshot: ${removed.length} removed, ${snapshot.count} kept.`);
  for (const entry of removed) console.log(`    - ${entry}`);
  console.log('  (prune-only: no entries were added)\n');
  process.exit(0);
}

let exitCode = 0;

/** @type {{ metric: string; expected: string|number; actual: string|number; pass: boolean }[]} */
const results = [];

function record(metric, expected, actual, pass) {
  results.push({ metric, expected, actual, pass });
  if (!pass) exitCode = 1;
}

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------
const flags = process.argv.slice(2);
const runAll = flags.length === 0 || flags.includes('--all');
const runTests = runAll || flags.includes('--tests');
const runCoverage = runAll || flags.includes('--coverage');
const runQuality = runAll || flags.includes('--quality');

// ===========================================================================
// 1. TEST SUITE — run vitest with the json reporter, read the report file.
// Fail-loud: no SKIP, no TAP fallback. A non-zero vitest exit is NOT fatal
// by itself (vitest still writes the JSON when tests merely fail — failures
// surface through the passRate/knownFailures records). Missing report file,
// bad JSON, missing fields, or zero tests → exit 1.
// ===========================================================================
if (runTests) {
  console.log('\n--- Test Suite ---');

  const tmpDir = mkdtempSync(join(tmpdir(), 'quality-ratchet-'));
  const summaryPath = join(tmpDir, 'summary.json');
  try {
    const run = spawnSync(
      'npx',
      ['vitest', 'run', '--reporter=json', `--outputFile=${summaryPath}`],
      { cwd: ROOT, stdio: 'inherit' },
    );
    if (run.error) {
      console.error('ERROR: could not launch vitest —', run.error.message);
      process.exit(1);
    }

    let summary;
    try {
      summary = readVitestJsonSummary(summaryPath);
    } catch (err) {
      console.error(
        `ERROR: test-suite check failed to read vitest JSON report ` +
          `(vitest exit code ${run.status ?? 'null'}${run.signal ? `, signal ${run.signal}` : ''}) —`,
        err?.message ?? err,
      );
      process.exit(1);
    }

    const { numTotalTests, numFailedTests, passRate } = summary;
    record('totalTests', `>=${baseline.testSuite.totalTests}`, numTotalTests,
      numTotalTests >= baseline.testSuite.totalTests);
    record('passRate', `>=${baseline.testSuite.passRate}%`, `${passRate}%`,
      passRate >= baseline.testSuite.passRate);

    if (numFailedTests > baseline.testSuite.knownFailures) {
      record('unknownFailures', `<=${baseline.testSuite.knownFailures}`,
        numFailedTests, false);
    } else {
      record('knownFailures', `<=${baseline.testSuite.knownFailures}`,
        numFailedTests, true);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ===========================================================================
// 2. COVERAGE — run vitest --coverage, parse coverage-summary.json
// ===========================================================================
if (runCoverage) {
  console.log('\n--- Coverage ---');

  try {
    execSync('npx vitest run --coverage 2>&1', {
      cwd: ROOT,
      maxBuffer: 20 * 1024 * 1024,
      stdio: 'pipe',
    });
  } catch {
    // vitest may exit non-zero due to threshold enforcement; we parse the
    // JSON summary report written to ./coverage/coverage-summary.json
  }

  const summaryPath = resolve(ROOT, 'coverage', 'coverage-summary.json');
  if (existsSync(summaryPath)) {
    const cov = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    const total = cov.total;

    if (total) {
      for (const metric of ['lines', 'functions', 'branches', 'statements']) {
        const actual = total[metric]?.pct ?? 0;
        const threshold = baseline.coverage[metric];
        record(`coverage.${metric}`, `>=${threshold}%`, `${actual}%`,
          actual >= threshold);
      }
    } else {
      console.log('  SKIP: coverage-summary.json has no "total" block');
    }
  } else {
    console.log('  SKIP: coverage-summary.json not found at', summaryPath);
  }
}

// ===========================================================================
// 3. QUALITY — static checks (any types, console calls, banned imports)
// ===========================================================================
if (runQuality) {
  console.log('\n--- Quality ---');

  // 3a/3b/3d run against ONE pure-Node fs walk of src/**/*.{ts,tsx}
  // (scripts/static-quality-checks.mjs). Fail-loud, S14 3c pattern: any
  // IO/unexpected error exits 1 — no catch→PASS('N/A'). Zero matches is a
  // legitimate count of 0, never an error (the grep-exit-1-on-no-match
  // landmine no longer exists by construction).
  /** @type {ReturnType<typeof collectSourceFiles>} */
  let sourceFiles;
  try {
    sourceFiles = collectSourceFiles(ROOT);
  } catch (err) {
    console.error('ERROR: static quality checks failed —', err?.message ?? err);
    process.exit(1);
  }

  // 3a. `: any` types in src/ (line-based count, grep|wc -l parity)
  const anyCount = countPatternLines(sourceFiles, /: any\b/);
  record('anyTypes', `<=${baseline.quality.maxAnyTypes}`, anyCount,
    anyCount <= baseline.quality.maxAnyTypes);

  // 3b. console.log / console.warn / console.error in src/
  const consoleCount = countPatternLines(sourceFiles, /console\.(log|warn|error)/);
  record('consoleCalls', `<=${baseline.quality.maxConsoleCalls}`, consoleCount,
    consoleCount <= baseline.quality.maxConsoleCalls);

  // 3c. Files exceeding line limit — pure Node ratchet against the frozen
  // snapshot in quality.oversizedFileBaseline. FAILS LOUD on IO/unexpected
  // errors (no catch→PASS for this check): any error here exits 1.
  {
    const snapshot = baseline.quality?.oversizedFileBaseline;
    if (!snapshot || typeof snapshot.violators !== 'object' || snapshot.violators === null) {
      console.error('ERROR: quality.oversizedFileBaseline.violators missing from baseline');
      process.exit(1);
    }
    try {
      const limit = baseline.quality.maxFileSizeLines;
      const current = collectFileLineCounts(ROOT);
      const evaluation = evaluateOversizedFiles(current, snapshot.violators, limit);
      const overCount = current.filter((f) => f.lines > limit).length;

      if (!evaluation.pass) {
        for (const path of evaluation.newViolators) {
          console.error(`  NEW oversized file (>${limit} lines, not in baseline): ${path}`);
        }
        for (const path of evaluation.grownViolators) {
          console.error(`  GROWN oversized file (lines increased vs baseline): ${path}`);
        }
      }
      if (evaluation.prunable.length > 0) {
        console.log(
          `  NOTE: ${evaluation.prunable.length} baseline entr${evaluation.prunable.length === 1 ? 'y' : 'ies'} prunable` +
            ' (fixed/deleted) — run with --prune-oversized-snapshot to shrink the snapshot.',
        );
      }

      record(
        'filesOverMaxLines',
        `<=${snapshot.count} new=0 grown=0`,
        `${overCount} new=${evaluation.newViolators.length} grown=${evaluation.grownViolators.length}`,
        evaluation.pass,
      );
    } catch (err) {
      console.error('ERROR: oversized-file check failed —', err?.message ?? err);
      process.exit(1);
    }
  }

  // 3d. Banned imports (plain string literals, summed per import)
  const bannedCount = countBannedImports(sourceFiles, baseline.quality.bannedImports);
  record('bannedImports', 0, bannedCount, bannedCount === 0);
}

// ===========================================================================
// Print report
// ===========================================================================
console.log('\n--- Results ---\n');

const COL = { metric: 30, expected: 12, actual: 12 };
console.log(
  `${'METRIC'.padEnd(COL.metric)} ${'EXPECTED'.padEnd(COL.expected)} ${'ACTUAL'.padEnd(COL.actual)} STATUS`,
);
console.log('-'.repeat(COL.metric + COL.expected + COL.actual + 10));

for (const r of results) {
  const status = r.pass ? 'PASS' : 'FAIL';
  console.log(
    `${r.metric.padEnd(COL.metric)} ${String(r.expected).padEnd(COL.expected)} ${String(r.actual).padEnd(COL.actual)} ${status}`,
  );
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;

console.log(`\n  ${passed} passed, ${failed} failed out of ${results.length} checks`);

if (exitCode !== 0) {
  console.log('\n  QUALITY RATCHET FAILED — metrics regressed below baseline.\n');
} else {
  console.log('\n  All metrics meet or exceed baseline.\n');
}

process.exit(exitCode);
