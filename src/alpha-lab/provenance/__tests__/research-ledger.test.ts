/**
 * Research ledger tests
 *
 * Covers: append, chain integrity (prevHash), tamper detection, fail-safe
 * append (bad path does not throw), and empty-file handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
} from '../research-ledger';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let tmp: string;
let ledger: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'ledger-'));
  ledger = join(tmp, 'research-ledger.jsonl');
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const rec = (runId: string, hash = 'h-' + runId) => ({
  runId,
  configHash: hash,
  resultClass: 'IS' as const,
  strategyRef: 'strat',
  gates: { statistical_significance: true },
});

// ── Append & Read ─────────────────────────────────────────────────────────────

describe('appendLedgerRecord', () => {
  it('writes one JSON line per record', async () => {
    const r1 = await appendLedgerRecord(rec('run-1'), ledger);
    expect(r1.ok).toBe(true);
    const r2 = await appendLedgerRecord(rec('run-2'), ledger);
    expect(r2.ok).toBe(true);

    const raw = await readFile(ledger, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).runId).toBe('run-1');
    expect(JSON.parse(lines[1]).runId).toBe('run-2');
  });

  it('chains prevHash: record N carries the hash of record N-1', async () => {
    await appendLedgerRecord(rec('run-1'), ledger);
    const r2 = await appendLedgerRecord(rec('run-2'), ledger);
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error('expected ok');
    expect(r2.record.prevHash).not.toBe('');
    expect(r2.record.prevHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('first record has an empty prevHash', async () => {
    const r = await appendLedgerRecord(rec('run-1'), ledger);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.record.prevHash).toBe('');
  });
});

// ── Chain Verification ────────────────────────────────────────────────────────

describe('verifyLedgerChain', () => {
  it('returns -1 for an intact chain', async () => {
    await appendLedgerRecord(rec('run-1'), ledger);
    await appendLedgerRecord(rec('run-2'), ledger);
    const records = await readLedgerRecords(ledger);
    expect(verifyLedgerChain(records)).toBe(-1);
  });

  it('returns -1 for an empty ledger', async () => {
    expect(verifyLedgerChain([])).toBe(-1);
  });

  it('detects a tampered record (edited in place)', async () => {
    await appendLedgerRecord(rec('run-1'), ledger);
    await appendLedgerRecord(rec('run-2'), ledger);

    // Rewrite record 1 with a different configHash — its own hash changes,
    // so record 2's prevHash no longer matches.
    const records = await readLedgerRecords(ledger);
    records[0] = { ...records[0], configHash: 'tampered' };
    await writeFile(ledger, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const reloaded = await readLedgerRecords(ledger);
    expect(verifyLedgerChain(reloaded)).toBe(1);
  });

  it('detects a deleted record (chain broken at the gap)', async () => {
    await appendLedgerRecord(rec('run-1'), ledger);
    await appendLedgerRecord(rec('run-2'), ledger);
    await appendLedgerRecord(rec('run-3'), ledger);

    const records = await readLedgerRecords(ledger);
    // Remove the middle record — record 2's prevHash now points at record 0.
    records.splice(1, 1);
    await writeFile(ledger, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

    const reloaded = await readLedgerRecords(ledger);
    expect(verifyLedgerChain(reloaded)).toBe(1);
  });
});

// ── Fail-safe ─────────────────────────────────────────────────────────────────

describe('fail-safe', () => {
  it('does not throw when the ledger path is unwritable', async () => {
    // Path under a file — mkdir will fail.
    const blocker = join(tmp, 'file-blocker');
    await writeFile(blocker, 'x', 'utf8');
    const badLedger = join(blocker, 'sub', 'research-ledger.jsonl');

    const result = await appendLedgerRecord(rec('run-1'), badLedger);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('reads [] when the ledger file does not exist', async () => {
    const records = await readLedgerRecords(join(tmp, 'missing.jsonl'));
    expect(records).toEqual([]);
  });
});

// ── resultClass ───────────────────────────────────────────────────────────────

describe('resultClass', () => {
  it('accepts all four classes', async () => {
    for (const rc of ['IS', 'OOS', 'PAPER', 'LIVE'] as const) {
      const r = await appendLedgerRecord(
        { ...rec('run-' + rc, 'h-' + rc), resultClass: rc },
        join(tmp, rc + '.jsonl'),
      );
      expect(r.ok).toBe(true);
    }
  });
});