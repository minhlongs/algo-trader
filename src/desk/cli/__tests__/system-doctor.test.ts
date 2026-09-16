/**
 * System Doctor Tests — Check Engine & Report
 *
 * Covers the injected check engine (`runSystemDoctor`) with fake dependencies
 * and report rendering (`renderDoctorReport`).
 */

import { describe, it, expect, vi } from 'vitest';
import { runSystemDoctor, renderDoctorReport } from '../system-doctor';
import type { DoctorDeps } from '../system-doctor';

// ── Logger capture ────────────────────────────────────────────────────────────

vi.mock('../../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../../../shared/utils/logger';

// ── Fake deps factory ─────────────────────────────────────────────────────────

function fakeDeps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    getExecutionMode: () => 'READ_ONLY',
    countOhlcvCandles: async () => 1234,
    inspectLedger: async () => ({ state: 'ok', count: 7 }),
    loadGateSummary: async () => ({ totalGates: 10, passedCount: 4, hasPaperData: true }),
    readQualityBaselineVersion: async () => '1.0.2',
    ...overrides,
  };
}

// ── runSystemDoctor ───────────────────────────────────────────────────────────

describe('runSystemDoctor', () => {
  it('reports all five checks passing on a healthy environment', async () => {
    const report = await runSystemDoctor(fakeDeps());
    expect(report.checks.map((c) => c.id)).toEqual([
      'execution-mode',
      'ohlcv-store',
      'provenance-ledger',
      'promotion-gates',
      'quality-baseline',
    ]);
    expect(report.checks.every((c) => c.status === 'PASS')).toBe(true);
    expect(report.ok).toBe(true);
  });

  it('FAILS loudly when execution mode is LIVE', async () => {
    const report = await runSystemDoctor(fakeDeps({ getExecutionMode: () => 'LIVE' }));
    const check = report.checks.find((c) => c.id === 'execution-mode');
    expect(check?.status).toBe('FAIL');
    expect(check?.detail).toContain('LIVE');
    expect(report.ok).toBe(false);
  });

  it('FAILS when execution mode is PAPER (orders may be created)', async () => {
    const report = await runSystemDoctor(fakeDeps({ getExecutionMode: () => 'PAPER' }));
    const check = report.checks.find((c) => c.id === 'execution-mode');
    expect(check?.status).toBe('FAIL');
    expect(check?.detail).toContain('PAPER');
    expect(report.ok).toBe(false);
  });

  it('tolerates an unreachable database as UNREACHABLE (overall stays green)', async () => {
    const report = await runSystemDoctor(
      fakeDeps({
        countOhlcvCandles: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    );
    const check = report.checks.find((c) => c.id === 'ohlcv-store');
    expect(check?.status).toBe('UNREACHABLE');
    expect(check?.detail).toContain('ECONNREFUSED');
    expect(report.ok).toBe(true);
  });

  it('FAILS on a corrupt provenance ledger', async () => {
    const report = await runSystemDoctor(
      fakeDeps({ inspectLedger: async () => ({ state: 'corrupt', count: 0 }) }),
    );
    const check = report.checks.find((c) => c.id === 'provenance-ledger');
    expect(check?.status).toBe('FAIL');
    expect(report.ok).toBe(false);
  });

  it('treats a missing ledger as a valid fresh-install PASS', async () => {
    const report = await runSystemDoctor(
      fakeDeps({ inspectLedger: async () => ({ state: 'missing', count: 0 }) }),
    );
    const check = report.checks.find((c) => c.id === 'provenance-ledger');
    expect(check?.status).toBe('PASS');
    expect(check?.detail).toContain('fresh install');
    expect(report.ok).toBe(true);
  });

  it('prints an honest "no paper data yet" note when gates have no trades', async () => {
    const report = await runSystemDoctor(
      fakeDeps({ loadGateSummary: async () => ({ totalGates: 10, passedCount: 4, hasPaperData: false }) }),
    );
    const check = report.checks.find((c) => c.id === 'promotion-gates');
    expect(check?.status).toBe('PASS');
    expect(check?.detail).toContain('no paper data yet');
  });

  it('FAILs promotion-gates when gate evaluation itself throws', async () => {
    const report = await runSystemDoctor(
      fakeDeps({
        loadGateSummary: async () => {
          throw new Error('metrics exploded');
        },
      }),
    );
    const check = report.checks.find((c) => c.id === 'promotion-gates');
    expect(check?.status).toBe('FAIL');
    expect(check?.detail).toContain('metrics exploded');
    expect(report.ok).toBe(false);
  });

  it('FAILs quality-baseline when the file cannot be parsed', async () => {
    const report = await runSystemDoctor(
      fakeDeps({
        readQualityBaselineVersion: async () => {
          throw new Error('Unexpected token in JSON');
        },
      }),
    );
    const check = report.checks.find((c) => c.id === 'quality-baseline');
    expect(check?.status).toBe('FAIL');
    expect(report.ok).toBe(false);
  });
});

// ── renderDoctorReport ────────────────────────────────────────────────────────

describe('renderDoctorReport', () => {
  it('prints every check with status label and a final result line', () => {
    const report = {
      checks: [
        { id: 'execution-mode', label: 'Execution mode', status: 'PASS' as const, detail: 'READ_ONLY' },
        { id: 'ohlcv-store', label: 'Postgres ohlcv_candles', status: 'UNREACHABLE' as const, detail: 'down' },
        { id: 'quality-baseline', label: 'Quality baseline', status: 'FAIL' as const, detail: 'invalid JSON' },
      ],
      ok: false,
    };
    renderDoctorReport(report);

    const output = (logger.info as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(output).toContain('[PASS] Execution mode: READ_ONLY');
    expect(output).toContain('[UNREACHABLE] Postgres ohlcv_candles: down');
    expect(output).toContain('[FAIL] Quality baseline: invalid JSON');
    expect(output).toContain('Result:');
    expect(output).toContain('1 check(s) FAILED');
    expect(output).toContain('1 unreachable (tolerated)');
  });
});
