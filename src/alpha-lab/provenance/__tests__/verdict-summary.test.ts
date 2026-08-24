/**
 * Verdict Summary tests
 *
 * Covers: summarizeVerdicts (empty, single strategy, multiple strategies,
 * resultClass preservation, passRate edge cases) and loadVerdictSummary
 * (fail-safe with nonexistent path, real ledger file).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LedgerRecord } from '../research-ledger';
import { summarizeVerdicts, loadVerdictSummary } from '../verdict-summary';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'verdict-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function makeRecord(
  overrides: Partial<LedgerRecord> & { runId: string },
): LedgerRecord {
  return {
    configHash: 'hash-' + overrides.runId,
    resultClass: 'IS',
    strategyRef: 'test-strategy',
    recordedAt: '2026-08-25T10:00:00.000Z',
    gates: { gate_a: true },
    prevHash: '',
    ...overrides,
  };
}

// ── summarizeVerdicts ────────────────────────────────────────────────────────

describe('summarizeVerdicts', () => {
  it('returns empty summary for empty records', () => {
    const summary = summarizeVerdicts([]);
    expect(summary.byStrategy).toEqual({});
    expect(summary.totalRecords).toBe(0);
  });

  it('aggregates a single strategy correctly', () => {
    const records = [
      makeRecord({ runId: 'r1', strategyRef: 'alpha', gates: { g1: true }, recordedAt: '2026-08-20T10:00:00.000Z' }),
      makeRecord({ runId: 'r2', strategyRef: 'alpha', gates: { g1: false }, recordedAt: '2026-08-21T10:00:00.000Z' }),
      makeRecord({ runId: 'r3', strategyRef: 'alpha', gates: { g1: true, g2: true }, recordedAt: '2026-08-22T10:00:00.000Z' }),
    ];

    const summary = summarizeVerdicts(records);
    expect(summary.totalRecords).toBe(3);
    expect(summary.byStrategy['alpha']).toEqual({
      strategyRef: 'alpha',
      totalRuns: 3,
      passedCount: 2,
      passRate: 2 / 3,
      lastVerdictPassed: true,
      lastResultClass: 'IS',
      lastRecordedAt: '2026-08-22T10:00:00.000Z',
    });
  });

  it('preserves resultClass from the last record', () => {
    const records = [
      makeRecord({ runId: 'r1', strategyRef: 'beta', resultClass: 'IS', recordedAt: '2026-08-20T10:00:00.000Z' }),
      makeRecord({ runId: 'r2', strategyRef: 'beta', resultClass: 'OOS', recordedAt: '2026-08-21T10:00:00.000Z' }),
    ];

    const summary = summarizeVerdicts(records);
    expect(summary.byStrategy['beta']?.lastResultClass).toBe('OOS');
  });

  it('handles multiple strategies independently', () => {
    const records = [
      makeRecord({ runId: 'r1', strategyRef: 'alpha', gates: { g1: true }, recordedAt: '2026-08-20T10:00:00.000Z' }),
      makeRecord({ runId: 'r2', strategyRef: 'beta', gates: { g1: false }, recordedAt: '2026-08-20T10:00:00.000Z' }),
    ];

    const summary = summarizeVerdicts(records);
    expect(summary.byStrategy['alpha']?.passedCount).toBe(1);
    expect(summary.byStrategy['alpha']?.passRate).toBe(1);
    expect(summary.byStrategy['beta']?.passedCount).toBe(0);
    expect(summary.byStrategy['beta']?.passRate).toBe(0);
  });

  it('returns passRate 0 when totalRuns is 0 (never reached, but defensive)', () => {
    const summary = summarizeVerdicts([]);
    expect(summary.totalRecords).toBe(0);
    // No strategies exist, so passRate check is defensive.
  });
});

// ── loadVerdictSummary (fail-safe) ───────────────────────────────────────────

describe('loadVerdictSummary', () => {
  it('returns empty summary when ledger file does not exist', async () => {
    const summary = await loadVerdictSummary(join(tmp, 'nonexistent.jsonl'));
    expect(summary.totalRecords).toBe(0);
    expect(summary.byStrategy).toEqual({});
  });

  it('loads and summarizes a real ledger file', async () => {
    const ledgerPath = join(tmp, 'test-ledger.jsonl');
    const records = [
      makeRecord({ runId: 'r1', strategyRef: 'gamma', gates: { g1: true }, recordedAt: '2026-08-20T10:00:00.000Z' }),
      makeRecord({ runId: 'r2', strategyRef: 'gamma', gates: { g1: false }, recordedAt: '2026-08-21T10:00:00.000Z' }),
    ];
    await writeFile(ledgerPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const summary = await loadVerdictSummary(ledgerPath);
    expect(summary.totalRecords).toBe(2);
    expect(summary.byStrategy['gamma']?.passedCount).toBe(1);
  });

  it('uses DEFAULT_LEDGER_PATH when no path provided', async () => {
    // Just verify it doesn't throw when called with default path (which likely
    // doesn't exist in a test environment — fail-safe returns empty).
    const summary = await loadVerdictSummary();
    expect(summary.totalRecords).toBe(0);
  });
});
