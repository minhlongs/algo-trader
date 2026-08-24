/**
 * Alpha Report Store tests
 *
 * Covers: writeAlphaReport, readAlphaReportByCandidateId, listAlphaReports,
 * buildAlphaReportIndex, duplicate candidateId last-write-wins, missing root yields nothing,
 * unreadable/malformed report is skipped, and DEFAULT_ALPHA_REPORT_ROOT is exported.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAlphaReportIndex,
  readAlphaReportByCandidateId,
  listAlphaReports,
  writeAlphaReport,
  DEFAULT_ALPHA_REPORT_ROOT,
} from '../alpha-report-store';
import type { AlphaVerdict } from '../../attribution/alpha-evaluator';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'alpha-report-store-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const verdict = (passed: boolean, failures: string[] = []): AlphaVerdict => ({
  passed,
  failedCriteria: failures,
  comparisons: [],
  recommendation: passed ? 'PASS' : 'FAIL',
});

// ── writeAlphaReport ──────────────────────────────────────────────────────────

describe('writeAlphaReport', () => {
  it('writes a report file and returns the report with createdAt', async () => {
    const dir = join(tmp, 'reports');
    const v = verdict(true);
    const report = await writeAlphaReport(dir, 'candidate-1', v);

    expect(report.candidateId).toBe('candidate-1');
    expect(report.verdict.passed).toBe(true);
    expect(typeof report.createdAt).toBe('string');
    expect(report.createdAt.length).toBeGreaterThan(0);
  });

  it('creates the directory if it does not exist', async () => {
    const dir = join(tmp, 'new', 'nested', 'reports');
    const v = verdict(false, ['candidate did not beat buy-and-hold net PnL']);
    const report = await writeAlphaReport(dir, 'candidate-2', v);

    expect(report.candidateId).toBe('candidate-2');
    expect(report.verdict.passed).toBe(false);
    expect(report.verdict.failedCriteria).toContain('candidate did not beat buy-and-hold net PnL');
  });

  it('overwrites existing report for same candidateId (last write wins)', async () => {
    const dir = join(tmp, 'reports');
    const v1 = verdict(true);
    const v2 = verdict(false, ['candidate did not beat buy-and-hold net PnL']);

    await writeAlphaReport(dir, 'candidate-1', v1);
    const report2 = await writeAlphaReport(dir, 'candidate-1', v2);

    expect(report2.verdict.passed).toBe(false);
    expect(report2.verdict.failedCriteria).toContain('candidate did not beat buy-and-hold net PnL');
  });
});

// ── readAlphaReportByCandidateId ──────────────────────────────────────────────

describe('readAlphaReportByCandidateId', () => {
  it('returns null when root does not exist', async () => {
    const report = await readAlphaReportByCandidateId('candidate-1', join(tmp, 'does-not-exist'));
    expect(report).toBeNull();
  });

  it('returns the report when it exists', async () => {
    const dir = join(tmp, 'reports');
    const v = verdict(true);
    await writeAlphaReport(dir, 'candidate-1', v);

    const report = await readAlphaReportByCandidateId('candidate-1', dir);
    expect(report).not.toBeNull();
    expect(report?.candidateId).toBe('candidate-1');
    expect(report?.verdict.passed).toBe(true);
    expect(typeof report?.createdAt).toBe('string');
  });

  it('returns null for non-existent candidateId', async () => {
    const dir = join(tmp, 'reports');
    await writeAlphaReport(dir, 'candidate-1', verdict(true));

    const report = await readAlphaReportByCandidateId('candidate-999', dir);
    expect(report).toBeNull();
  });

  it('skips malformed JSON file without throwing', async () => {
    const dir = join(tmp, 'reports');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'candidate-bad.json'), 'not json{{{');

    const report = await readAlphaReportByCandidateId('candidate-bad', dir);
    expect(report).toBeNull();
  });
});

// ── listAlphaReports ──────────────────────────────────────────────────────────

describe('listAlphaReports', () => {
  it('returns empty array when root does not exist', async () => {
    const reports = await listAlphaReports(join(tmp, 'does-not-exist'));
    expect(reports).toEqual([]);
  });

  it('lists reports sorted by createdAt most recent first', async () => {
    const dir = join(tmp, 'reports');
    const v = verdict(true);
    // Write with small delays to ensure different timestamps
    await writeAlphaReport(dir, 'candidate-old', v);
    await new Promise((r) => setTimeout(r, 10));
    await writeAlphaReport(dir, 'candidate-new', v);

    const reports = await listAlphaReports(dir);
    expect(reports).toHaveLength(2);
    expect(reports[0].candidateId).toBe('candidate-new'); // most recent first
    expect(reports[1].candidateId).toBe('candidate-old');
  });

  it('respects limit parameter', async () => {
    const dir = join(tmp, 'reports');
    const v = verdict(true);
    for (let i = 0; i < 5; i++) {
      await writeAlphaReport(dir, `candidate-${i}`, v);
    }

    const reports = await listAlphaReports(dir, 3);
    expect(reports).toHaveLength(3);
  });

  it('includes passed field correctly', async () => {
    const dir = join(tmp, 'reports');
    await writeAlphaReport(dir, 'pass', verdict(true));
    await writeAlphaReport(dir, 'fail', verdict(false, ['criterion failed']));

    const reports = await listAlphaReports(dir);
    const passReport = reports.find((r) => r.candidateId === 'pass');
    const failReport = reports.find((r) => r.candidateId === 'fail');

    expect(passReport?.passed).toBe(true);
    expect(failReport?.passed).toBe(false);
  });
});

// ── buildAlphaReportIndex ─────────────────────────────────────────────────────

describe('buildAlphaReportIndex', () => {
  it('builds index with last-write-wins on duplicate candidateId', async () => {
    const dir = join(tmp, 'reports');
    await writeAlphaReport(dir, 'candidate-1', verdict(true));
    // Write again with different verdict
    await writeAlphaReport(dir, 'candidate-1', verdict(false, ['failed']));

    const index = await buildAlphaReportIndex(dir);
    expect(index.size).toBe(1);
    const entry = index.get('candidate-1');
    expect(entry).toBeDefined();
    expect(entry?.path).toContain('candidate-1.json');
  });

  it('finds reports recursively in subdirectories', async () => {
    const deep = join(tmp, 'a', 'b', 'c');
    await writeAlphaReport(deep, 'candidate-deep', verdict(true));

    const index = await buildAlphaReportIndex(tmp);
    expect(index.size).toBe(1);
    expect(index.get('candidate-deep')).toBeDefined();
  });
});

// ── DEFAULT_ALPHA_REPORT_ROOT ─────────────────────────────────────────────────

describe('DEFAULT_ALPHA_REPORT_ROOT', () => {
  it('is exported and has expected value', () => {
    expect(DEFAULT_ALPHA_REPORT_ROOT).toBe('data/alpha-reports');
  });
});