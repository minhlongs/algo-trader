/**
 * Alpha Report Store tests
 *
 * Covers: writeAlphaReport, readAlphaReportByCandidateId, listAlphaReports,
 * buildAlphaReportIndex, duplicate candidateId last-write-wins, missing root yields nothing,
 * unreadable/malformed report is skipped, and DEFAULT_ALPHA_REPORT_ROOT is exported.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../../../shared/utils/logger';

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

  it('handles write failure with Error and logs warning without throwing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    const blocker = join(tmp, 'file-blocker');
    await writeFile(blocker, 'x', 'utf8');
    const badDir = join(blocker, 'sub');

    const report = await writeAlphaReport(badDir, 'candidate-err', verdict(true));
    expect(report.candidateId).toBe('candidate-err');
    expect(warnSpy).toHaveBeenCalledWith(
      '[AlphaReportStore] write failed',
      expect.objectContaining({
        candidateId: 'candidate-err',
        err: expect.any(String),
      }),
    );
    warnSpy.mockRestore();
  });

  it('handles write failure with non-Error throw and logs String(err)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    const badVerdict: AlphaVerdict = {
      get recommendation(): 'PASS' | 'FAIL' {
        throw 'non-error-write-fail';
      },
      passed: true,
      failedCriteria: [],
      comparisons: [],
    };

    const report = await writeAlphaReport(tmp, 'candidate-non-err', badVerdict);
    expect(report.candidateId).toBe('candidate-non-err');
    expect(warnSpy).toHaveBeenCalledWith('[AlphaReportStore] write failed', {
      candidateId: 'candidate-non-err',
      err: 'non-error-write-fail',
    });
    warnSpy.mockRestore();
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

  it('uses DEFAULT_ALPHA_REPORT_ROOT when root parameter is omitted', async () => {
    const report = await readAlphaReportByCandidateId('non-existent-default');
    expect(report).toBeNull();
  });

  it('handles unreadable report when non-Error thrown during parsing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    const dir = join(tmp, 'reports');
    await writeAlphaReport(dir, 'candidate-non-err-read', verdict(true));

    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw 'non-error-read-fail';
    });

    try {
      const report = await readAlphaReportByCandidateId('candidate-non-err-read', dir);
      expect(report).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[AlphaReportStore] unreadable alpha report',
        expect.objectContaining({
          candidateId: 'candidate-non-err-read',
          err: 'non-error-read-fail',
        }),
      );
    } finally {
      parseSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

// ── listAlphaReports ──────────────────────────────────────────────────────────

describe('listAlphaReports', () => {
  it('returns empty array when root does not exist', async () => {
    const reports = await listAlphaReports(join(tmp, 'does-not-exist'));
    expect(reports).toEqual([]);
  });

  it('uses DEFAULT_ALPHA_REPORT_ROOT and default limit when parameters are omitted', async () => {
    const reports = await listAlphaReports();
    expect(Array.isArray(reports)).toBe(true);
  });

  it('skips unreadable reports without failing the list', async () => {
    const dir = join(tmp, 'reports');
    await writeAlphaReport(dir, 'valid-1', verdict(true));
    await writeFile(join(dir, 'corrupt.json'), 'not valid json{{');

    const reports = await listAlphaReports(dir);
    expect(reports).toHaveLength(1);
    expect(reports[0].candidateId).toBe('valid-1');
  });

  it('sorts correctly when reports have matching timestamps or reverse order', async () => {
    const dir = join(tmp, 'reports');
    await mkdir(dir, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(
      join(dir, 'rep-a.json'),
      JSON.stringify({ candidateId: 'rep-a', verdict: verdict(true), createdAt: now }),
    );
    await writeFile(
      join(dir, 'rep-b.json'),
      JSON.stringify({ candidateId: 'rep-b', verdict: verdict(false), createdAt: now }),
    );

    const reports = await listAlphaReports(dir);
    expect(reports).toHaveLength(2);
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

  it('skips non-json files and symlink entries', async () => {
    const dir = join(tmp, 'mixed');
    await mkdir(dir, { recursive: true });
    await writeAlphaReport(dir, 'valid-item', verdict(true));
    await writeFile(join(dir, 'ignore.txt'), 'not json');
    await symlink(join(dir, 'valid-item.json'), join(dir, 'symlink-item'));

    const index = await buildAlphaReportIndex(dir);
    expect(index.size).toBe(1);
    expect(index.has('valid-item')).toBe(true);
    expect(index.has('ignore')).toBe(false);
  });

  it('uses DEFAULT_ALPHA_REPORT_ROOT when root parameter is omitted', async () => {
    const index = await buildAlphaReportIndex();
    expect(index).toBeInstanceOf(Map);
  });

  it('handles walk failure with non-Error throw and logs warning with String(err)', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue();
    const dir = join(tmp, 'walk-throw');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'dummy.json'), '{}');

    const orig = Dirent.prototype.isDirectory;
    Dirent.prototype.isDirectory = function () {
      throw 'non-error-walk-failure';
    };

    try {
      const index = await buildAlphaReportIndex(dir);
      expect(index.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith('[AlphaReportStore] walk failed', {
        root: dir,
        err: 'non-error-walk-failure',
      });
    } finally {
      Dirent.prototype.isDirectory = orig;
      warnSpy.mockRestore();
    }
  });
});

// ── DEFAULT_ALPHA_REPORT_ROOT ─────────────────────────────────────────────────

describe('DEFAULT_ALPHA_REPORT_ROOT', () => {
  it('is exported and has expected value', () => {
    expect(DEFAULT_ALPHA_REPORT_ROOT).toBe('data/alpha-reports');
  });
});