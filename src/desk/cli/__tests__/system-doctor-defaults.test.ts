/**
 * System Doctor Tests — Real Defaults & Env Override
 *
 * Tests real default dependency implementations (`inspectLedger`, `loadGateSummary`,
 * `readQualityBaselineVersion`) against a per-test tmpdir / stubbed network.
 *
 * Tests `PAPER_TRADES_API` env override behavior requiring module reset + dynamic imports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { inspectLedger } from '../system-doctor-defaults';

// ── Real default implementations ──────────────────────────────────────────────

describe('inspectLedger (real implementation)', () => {
  let ledgerPath: string;
  let ledgerDir: string;

  beforeEach(async () => {
    ledgerDir = await mkdtemp(join(tmpdir(), 'system-doctor-test-'));
    ledgerPath = join(ledgerDir, 'research-ledger.jsonl');
  });

  afterEach(async () => {
    await rm(ledgerDir, { recursive: true, force: true });
  });

  it('returns missing when no ledger file exists', async () => {
    await expect(inspectLedger(ledgerPath)).resolves.toEqual({ state: 'missing', count: 0 });
  });

  it('returns the record count when the ledger is readable', async () => {
    const line = JSON.stringify({
      runId: 'run-1',
      configHash: 'cfg',
      resultClass: 'IS',
      strategyRef: 'rsi',
      recordedAt: '2026-01-01T00:00:00Z',
      gates: {},
      prevHash: '',
    });
    await writeFile(ledgerPath, `${line}\n${line}\n`);
    await expect(inspectLedger(ledgerPath)).resolves.toEqual({ state: 'ok', count: 2 });
  });

  it('returns corrupt when the file exists but records do not parse', async () => {
    await writeFile(ledgerPath, '{not-json-at-all\n');
    await expect(inspectLedger(ledgerPath)).resolves.toEqual({ state: 'corrupt', count: 0 });
  });
});

describe('defaultDoctorDeps (real implementations)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getDefaultDoctorDeps() {
    const mod = await import('../system-doctor-defaults');
    return mod.defaultDoctorDeps();
  }

  it('degrades gracefully to an empty-trade gate summary when offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const deps = await getDefaultDoctorDeps();
    const summary = await deps.loadGateSummary();
    expect(summary.hasPaperData).toBe(false);
    expect(summary.totalGates).toBe(10);
    expect(summary.passedCount).toBeLessThan(summary.totalGates);
  });

  it('reads the repository quality baseline version', async () => {
    const deps = await getDefaultDoctorDeps();
    const version = await deps.readQualityBaselineVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('exposes all five dependency slots', async () => {
    const deps = await getDefaultDoctorDeps();
    expect(typeof deps.getExecutionMode).toBe('function');
    expect(typeof deps.countOhlcvCandles).toBe('function');
    expect(typeof deps.inspectLedger).toBe('function');
    expect(typeof deps.loadGateSummary).toBe('function');
    expect(typeof deps.readQualityBaselineVersion).toBe('function');
  });
});

// ── PAPER_TRADES_API env override ─────────────────────────────────────────────
// The URL is read at module load time (same pattern as check-gates.ts), so
// each case must import the module fresh AFTER stubbing the env var.

describe('PAPER_TRADES_API env override', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function captureFetchUrl(): Promise<string | undefined> {
    let capturedUrl: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        capturedUrl = String(url);
        throw new Error('network down');
      }),
    );
    const mod = await import('../system-doctor-defaults');
    const deps = mod.defaultDoctorDeps();
    await deps.loadGateSummary();
    return capturedUrl;
  }

  it('honors the PAPER_TRADES_API env override', async () => {
    vi.stubEnv('PAPER_TRADES_API', 'https://example.test/paper-trades');
    const url = await captureFetchUrl();
    expect(url).toBe('https://example.test/paper-trades');
  });

  it('falls back to the default cashclaw URL when PAPER_TRADES_API is unset', async () => {
    vi.stubEnv('PAPER_TRADES_API', undefined);
    const url = await captureFetchUrl();
    expect(url).toBe('https://api.cashclaw.cc/api/v1/paper-trades');
  });
});
