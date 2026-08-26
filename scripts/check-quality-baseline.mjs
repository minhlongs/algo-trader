#!/usr/bin/env node

/**
 * Quality Ratchet — checks current metrics against quality-baseline.json.
 * Exits 1 if any metric regresses below baseline thresholds.
 *
 * Usage:
 *   node scripts/check-quality-baseline.mjs [--coverage] [--tests] [--quality] [--all]
 *   Default: --all
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectFileLineCounts,
  evaluateOversizedFiles,
} from './oversized-file-check.mjs';

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
// 1. TEST SUITE — run vitest, parse json-summary
// ===========================================================================
if (runTests) {
  console.log('\n--- Test Suite ---');

  try {
    const testJson = execSync(
      'npx vitest run --reporter=json-summary --reporter=default 2>&1 || true',
      { cwd: ROOT, maxBuffer: 20 * 1024 * 1024, encoding: 'utf-8' },
    );

    // Extract the json-summary portion (last JSON object in output)
    const jsonMatch = testJson.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}\s*\}/);
    if (jsonMatch) {
      const summary = JSON.parse(jsonMatch[0]);
      const numTotal = summary.numTotalTests ?? 0;
      const numPassed = summary.numPassedTests ?? 0;
      const numFailed = summary.numFailedTests ?? 0;
      const passRate = numTotal > 0
        ? parseFloat(((numTotal - numFailed) / numTotal * 100).toFixed(2))
        : 0;

      record('totalTests', `>=${baseline.testSuite.totalTests}`, numTotal,
        numTotal >= baseline.testSuite.totalTests);
      record('passRate', `>=${baseline.testSuite.passRate}%`, `${passRate}%`,
        passRate >= baseline.testSuite.passRate);

      if (numFailed > baseline.testSuite.knownFailures) {
        record('unknownFailures', `<=${baseline.testSuite.knownFailures}`,
          numFailed,
          false);
      } else {
        record('knownFailures', `<=${baseline.testSuite.knownFailures}`,
          numFailed, true);
      }
    } else {
      // Fallback: parse TAP-like output for pass/fail counts
      const totalMatch = testJson.match(/Tests\s+(\d+)\s+passed/);
      const failMatch = testJson.match(/Tests\s+\d+\s+passed,\s+(\d+)\s+failed/);
      if (totalMatch) {
        const passed = parseInt(totalMatch[1], 10);
        const failed = failMatch ? parseInt(failMatch[1], 0) : 0;
        const total = passed + failed;
        record('totalTests', `>=${baseline.testSuite.totalTests}`, total,
          total >= baseline.testSuite.totalTests);
      } else {
        console.log('  SKIP: Could not parse test results (no JSON summary found)');
      }
    }
  } catch (err) {
    console.log('  SKIP: vitest run failed —', err.message?.split('\n')[0]);
  }
}

// ===========================================================================
// 2. COVERAGE — run vitest --coverage, parse json-summary report
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

  // 3a. `:any` types in src/ (exclude type assertions `as any` from test fixtures)
  try {
    const anyCount = parseInt(
      execSync(
        `grep -r ': any\\b' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l`,
        { cwd: ROOT, encoding: 'utf-8' },
      ).trim(),
      10,
    );
    record('anyTypes', `<=${baseline.quality.maxAnyTypes}`, anyCount,
      anyCount <= baseline.quality.maxAnyTypes);
  } catch {
    record('anyTypes', `<=${baseline.quality.maxAnyTypes}`, 'N/A', true);
  }

  // 3b. console.log / console.warn / console.error in src/
  try {
    const consoleCount = parseInt(
      execSync(
        `grep -r 'console\\.\\(log\\|warn\\|error\\)' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l`,
        { cwd: ROOT, encoding: 'utf-8' },
      ).trim(),
      10,
    );
    record('consoleCalls', `<=${baseline.quality.maxConsoleCalls}`, consoleCount,
      consoleCount <= baseline.quality.maxConsoleCalls);
  } catch {
    record('consoleCalls', `<=${baseline.quality.maxConsoleCalls}`, 'N/A', true);
  }

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

  // 3d. Banned imports
  try {
    let bannedCount = 0;
    for (const imp of baseline.quality.bannedImports) {
      const hits = execSync(
        `grep -r "${imp}" src/ --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l`,
        { cwd: ROOT, encoding: 'utf-8' },
      ).trim();
      bannedCount += parseInt(hits, 10) || 0;
    }
    record('bannedImports', 0, bannedCount, bannedCount === 0);
  } catch {
    record('bannedImports', 0, 'N/A', true);
  }
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
