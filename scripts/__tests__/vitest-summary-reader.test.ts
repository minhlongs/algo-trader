import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs module has no type declarations (scripts/ is outside tsconfig include)
import { readVitestJsonSummary } from '../vitest-summary-reader.mjs';

const REPO_ROOT = join(__dirname, '..', '..');

let tmpDir: string;

beforeEach(() => {
  tmpDir = `/tmp/vitest-summary-reader-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function writeSummary(name: string, value: unknown): string {
  const path = join(tmpDir, name);
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  return path;
}

describe('readVitestJsonSummary', () => {
  it('parses a valid report and computes passRate (real vitest json shape)', () => {
    const path = writeSummary('summary.json', {
      numTotalTests: 7229,
      numPassedTests: 7218,
      numFailedTests: 0,
      numPendingTests: 11,
      success: true,
    });
    expect(readVitestJsonSummary(path)).toEqual({
      numTotalTests: 7229,
      numPassedTests: 7218,
      numFailedTests: 0,
      passRate: 100,
    });
  });

  it('computes passRate = (total - failed) / total rounded to 2 decimals', () => {
    const path = writeSummary('summary.json', {
      numTotalTests: 3,
      numPassedTests: 2,
      numFailedTests: 1,
      numPendingTests: 0,
      success: false,
    });
    expect(readVitestJsonSummary(path).passRate).toBe(66.67);
  });

  it('throws (fail loud) when the file is missing', () => {
    expect(() => readVitestJsonSummary(join(tmpDir, 'nope.json'))).toThrow(
      /summary file not found/,
    );
  });

  it('throws (failloud) when the file is not valid JSON', () => {
    const path = writeSummary('summary.json', '{ not json !!!');
    expect(() => readVitestJsonSummary(path)).toThrow(/not valid JSON/);
  });

  it('throws when a required field is missing', () => {
    const path = writeSummary('summary.json', {
      numTotalTests: 10,
      numPassedTests: 10,
      // numFailedTests intentionally absent
    });
    expect(() => readVitestJsonSummary(path)).toThrow(/"numFailedTests" missing/);
  });

  it('throws when a required field is not a non-negative number', () => {
    const path = writeSummary('summary.json', {
      numTotalTests: 10,
      numPassedTests: '10',
      numFailedTests: 0,
    });
    expect(() => readVitestJsonSummary(path)).toThrow(/"numPassedTests" missing/);
  });

  it('throws when the JSON root is not an object', () => {
    const path = writeSummary('summary.json', [1, 2, 3]);
    expect(() => readVitestJsonSummary(path)).toThrow(/root is not an object/);
  });

  it('throws when numTotalTests is 0 (config breakage)', () => {
    const path = writeSummary('summary.json', {
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
    });
    expect(() => readVitestJsonSummary(path)).toThrow(/numTotalTests is 0/);
  });
});

describe('end-to-end against the installed vitest json reporter', () => {
  it('reads real numbers from --reporter=json --outputFile on a real test file', () => {
    const summaryPath = join(tmpDir, 'e2e-summary.json');
    const run = spawnSync(
      'npx',
      [
        'vitest',
        'run',
        'scripts/__tests__/oversized-file-check.test.ts',
        '--reporter=json',
        `--outputFile=${summaryPath}`,
      ],
      { cwd: REPO_ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 180_000 },
    );
    expect(run.status, `vitest run failed: ${run.stderr}`).toBe(0);
    expect(existsSync(summaryPath)).toBe(true);

    const summary = readVitestJsonSummary(summaryPath);
    expect(summary.numTotalTests).toBe(18);
    expect(summary.numPassedTests).toBe(18);
    expect(summary.numFailedTests).toBe(0);
    expect(summary.passRate).toBe(100);
  });
});
