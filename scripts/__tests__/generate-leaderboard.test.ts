/**
 * Tests for the generated backtest leaderboard and its CI drift guard.
 *
 * Two behaviours are proven here:
 *   1. a change to a single CSV cell propagates into the rendered doc;
 *   2. `scripts/check-leaderboard-drift.mjs` fails when the committed doc is stale
 *      or hand-edited, and passes when it matches the generator.
 *
 * Each test renders into a throwaway sandbox directory via the `--csv-dir` seam,
 * so the repo CSV and the committed doc are never written to.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..');
const GENERATOR = resolve(ROOT, 'scripts', 'generate-leaderboard.mjs');
const GUARD = resolve(ROOT, 'scripts', 'check-leaderboard-drift.mjs');
const REAL_CSV = resolve(ROOT, 'reports', 'backtest-results.csv');

const SANDBOX = mkdtempSync(join(tmpdir(), 'leaderboard-test-'));
const SANDBOX_CSV = join(SANDBOX, 'reports', 'backtest-results.csv');
const SANDBOX_DOC = join(SANDBOX, 'docs', 'backtest-leaderboard.md');

/** Sentinel a row renders as when it carries no trades. */
const INSUFFICIENT_LABEL = 'không đủ dữ liệu';

/** Run a repo script with `--csv-dir`/output paths pointed at the sandbox. */
function runInSandbox(script: string, extraArgs: string[] = []): spawnSync.Returns<string> {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', script, '--csv-dir', SANDBOX, '--doc', SANDBOX_DOC, ...extraArgs],
    { cwd: ROOT, encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 },
  );
}

function render(): string {
  const run = runInSandbox(GENERATOR);
  if (run.status !== 0) throw new Error(`generator failed: ${run.stderr ?? run.stdout}`);
  return readFileSync(SANDBOX_DOC, 'utf-8');
}

beforeAll(() => {
  mkdirSync(join(SANDBOX, 'reports'), { recursive: true });
  mkdirSync(join(SANDBOX, 'docs'), { recursive: true });
  copyFileSync(REAL_CSV, SANDBOX_CSV);
});

afterAll(() => {
  rmSync(SANDBOX, { recursive: true, force: true });
});

describe('generate-leaderboard', () => {
  it('renders a sample-size column and never prints Infinity', () => {
    const doc = render();

    expect(doc).toContain('Total Trades / Cỡ mẫu');
    expect(doc).not.toContain('Infinity');
    expect(doc).toContain('n/a — profit factor vô hạn trên mẫu quá nhỏ');
    expect(doc).toContain(INSUFFICIENT_LABEL);
  });

  it('propagates a single CSV cell change into the rendered doc', () => {
    const before = render();

    const csv = readFileSync(SANDBOX_CSV, 'utf-8');
    const edited = csv.replace('bollinger-squeeze,19.5200', 'bollinger-squeeze,55.5500');
    expect(edited).not.toBe(csv);
    writeFileSync(SANDBOX_CSV, edited, 'utf-8');

    const after = render();

    expect(after).not.toBe(before);
    expect(after).toContain('55.55');
    expect(before).not.toContain('55.55');

    copyFileSync(REAL_CSV, SANDBOX_CSV);
  });

  it('gives a zero-trade row no Sharpe and no rank even when the CSV cell is non-zero', () => {
    const header = readFileSync(REAL_CSV, 'utf-8').split('\n')[0];
    writeFileSync(
      SANDBOX_CSV,
      [
        header,
        'alpha-tiny,9.9900,100.00,1.00,Infinity,0.00,3,3,0,0.33,0.34,0.32,110,OK',
        'beta-empty,5.5500,0.00,0.00,0.0000,0.00,0,0,0,0.00,0.00,0.00,101,OK',
        '',
      ].join('\n'),
      'utf-8',
    );

    const doc = render();

    // The ranked table has exactly one data row, and it is alpha-tiny.
    const rankedRows = doc.split('\n').filter((line) => /^\s*\|\s*\d+\s*\|/.test(line));
    expect(rankedRows).toHaveLength(1);
    expect(rankedRows[0]).toContain('alpha-tiny');
    expect(rankedRows[0]).toContain('9.99');

    // beta-empty appears only in the insufficient-sample section.
    const betaLines = doc.split('\n').filter((line) => line.includes('beta-empty'));
    expect(betaLines.length).toBeGreaterThan(0);
    for (const line of betaLines) {
      expect(line).toContain(INSUFFICIENT_LABEL);
      expect(line).not.toMatch(/\|\s*\d+\.\d{2}\s*\|/); // no Sharpe/win-rate/P&L value
    }

    copyFileSync(REAL_CSV, SANDBOX_CSV);
  });

  it('is idempotent — a second run writes byte-identical output', () => {
    expect(render()).toBe(render());
  });
});

describe('check-leaderboard-drift guard', () => {
  it('passes when the doc matches and fails when the CSV moved without a regen', () => {
    render();

    expect(runInSandbox(GUARD).status).toBe(0);

    // Mutate the CSV, do NOT regenerate — the guard must catch the drift.
    const csv = readFileSync(SANDBOX_CSV, 'utf-8');
    writeFileSync(SANDBOX_CSV, csv.replace('bollinger-squeeze,19.5200', 'bollinger-squeeze,77.7700'), 'utf-8');

    const stale = runInSandbox(GUARD);
    expect(stale.status).toBe(1);
    expect(`${stale.stdout ?? ''}${stale.stderr ?? ''}`).toContain('DRIFT');

    copyFileSync(REAL_CSV, SANDBOX_CSV);
  });

  it('fails when the committed doc has been hand-edited', () => {
    render();

    writeFileSync(SANDBOX_DOC, `${readFileSync(SANDBOX_DOC, 'utf-8')}\n<!-- hand edit -->\n`, 'utf-8');

    const edited = runInSandbox(GUARD);
    expect(edited.status).toBe(1);
    expect(`${edited.stdout ?? ''}${edited.stderr ?? ''}`).toContain('DRIFT');

    // Regenerating clears the drift again.
    render();
    expect(runInSandbox(GUARD).status).toBe(0);
  });
});
