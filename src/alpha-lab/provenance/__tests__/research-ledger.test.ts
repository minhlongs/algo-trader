/**
 * Research ledger tests
 * Covers: append, chain integrity (prevHash), tamper detection, fail-safe,
 * provenance fields (hypothesis, parameters, foldMetrics, gateVerdict), deterministic hashing, and querying.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
  filterLedgerRecords,
  queryLedgerRecords,
  computeRecordHash,
  canonicalRecord,
} from '../research-ledger';

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

describe('appendLedgerRecord & chaining', () => {
  it('writes JSON lines and chains prevHash correctly', async () => {
    const r1 = await appendLedgerRecord(rec('run-1'), ledger);
    expect(r1.ok && r1.record.prevHash).toBe('');
    const r2 = await appendLedgerRecord(rec('run-2'), ledger);
    expect(r2.ok && r2.record.prevHash).toMatch(/^[0-9a-f]{64}$/);

    const raw = await readFile(ledger, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).runId).toBe('run-1');
  });

  it('records provenance fields: hypothesis, parameters, foldMetrics, and gateVerdict', async () => {
    const r = await appendLedgerRecord({
      runId: 'run-prov-1',
      configHash: 'cfg-hash-1',
      resultClass: 'VALIDATED' as const,
      strategyRef: 'strat-momentum',
      lifecycleState: 'VALIDATED',
      hypothesisId: 'hyp-42',
      hypothesis: 'Momentum breakout in trending regime',
      parameters: { fastPeriod: 12, slowPeriod: 26, threshold: 0.05 },
      foldMetrics: { fold_0_sharpe: 1.85, fold_1_sharpe: 2.1 },
      gateVerdict: { sharpe_gate: true, dd_gate: true },
    }, ledger);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.hypothesisId).toBe('hyp-42');
    expect(r.record.parameters?.fastPeriod).toBe(12);
    expect(r.record.foldMetrics?.fold_0_sharpe).toBe(1.85);
    expect(r.record.entryHash).toBe(computeRecordHash(r.record));

    const loaded = await readLedgerRecords(ledger);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.hypothesis).toBe('Momentum breakout in trending regime');
    expect(verifyLedgerChain(loaded)).toBe(-1);
  });
});

describe('verifyLedgerChain', () => {
  it('returns -1 for intact chain and empty ledger', async () => {
    expect(verifyLedgerChain([])).toBe(-1);
    await appendLedgerRecord(rec('run-1'), ledger);
    await appendLedgerRecord(rec('run-2'), ledger);
    expect(verifyLedgerChain(await readLedgerRecords(ledger))).toBe(-1);
  });

  it('detects in-place edit and deletion', async () => {
    await appendLedgerRecord(rec('run-1'), ledger);
    await appendLedgerRecord(rec('run-2'), ledger);
    await appendLedgerRecord(rec('run-3'), ledger);

    const records = await readLedgerRecords(ledger);
    records[0] = { ...records[0]!, configHash: 'tampered' };
    await writeFile(ledger, records.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    expect(verifyLedgerChain(await readLedgerRecords(ledger))).toBe(1);

    // Deletion
    const fresh = await readLedgerRecords(ledger);
    fresh.splice(1, 1);
    expect(verifyLedgerChain(fresh)).not.toBe(-1);
  });

  it('detects tampering in parameters or foldMetrics', async () => {
    await appendLedgerRecord({
      ...rec('run-p'),
      parameters: { window: 20 },
      foldMetrics: { sharpe: 1.5 },
    }, ledger);

    const records = await readLedgerRecords(ledger);
    records[0]!.parameters = { window: 999 };
    expect(verifyLedgerChain(records)).toBe(0);
  });
});

describe('deterministic canonicalRecord', () => {
  it('produces identical canonical string regardless of parameter key insertion order', () => {
    const base = {
      runId: 'r1',
      configHash: 'c1',
      resultClass: 'IS' as const,
      strategyRef: 's1',
      recordedAt: '2026-01-01T00:00:00Z',
      gates: { g1: true },
    };
    const s1 = canonicalRecord({ ...base, parameters: { a: 1, b: { z: 9, y: 8 } } });
    const s2 = canonicalRecord({ ...base, parameters: { b: { y: 8, z: 9 }, a: 1 } });
    expect(s1).toBe(s2);
    expect(computeRecordHash({ ...base, parameters: { a: 1, b: 2 } }))
      .toBe(computeRecordHash({ ...base, parameters: { b: 2, a: 1 } }));
  });
});

describe('filterLedgerRecords & queryLedgerRecords', () => {
  it('filters by hypothesisId, strategyRef, resultClass, and lifecycleState', async () => {
    await appendLedgerRecord({ ...rec('r1'), hypothesisId: 'h1', strategyRef: 'sA', resultClass: 'IS' }, ledger);
    await appendLedgerRecord({ ...rec('r2'), hypothesisId: 'h2', strategyRef: 'sB', resultClass: 'VALIDATED', lifecycleState: 'VALIDATED' }, ledger);

    const all = await readLedgerRecords(ledger);
    expect(filterLedgerRecords(all, { hypothesisId: 'h1' })).toHaveLength(1);
    expect(filterLedgerRecords(all, { strategyRef: 'sB' })).toHaveLength(1);
    expect(filterLedgerRecords(all, { lifecycleState: 'VALIDATED' })).toHaveLength(1);
    expect(filterLedgerRecords(all, { resultClass: 'LIVE' })).toHaveLength(0);

    const queried = await queryLedgerRecords({ hypothesisId: 'h2' }, ledger);
    expect(queried).toHaveLength(1);
    expect(queried[0]!.runId).toBe('r2');
  });
});

describe('fail-safe & resultClass', () => {
  it('does not throw when unwritable or file missing', async () => {
    const blocker = join(tmp, 'blocker');
    await writeFile(blocker, 'x', 'utf8');
    const res = await appendLedgerRecord(rec('r1'), join(blocker, 'sub', 'ledger.jsonl'));
    expect(res.ok).toBe(false);
    expect(await readLedgerRecords(join(tmp, 'missing.jsonl'))).toEqual([]);
  });

  it('formats non-Error throw fallback and accepts all result classes', async () => {
    const badGates: Record<string, boolean> = { get fail(): boolean { throw 'string-fail'; } };
    const res = await appendLedgerRecord({ ...rec('r-err'), gates: badGates }, ledger);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('string-fail');

    for (const rc of ['IS', 'OOS', 'PAPER', 'LIVE'] as const) {
      const r = await appendLedgerRecord({ ...rec('r-' + rc), resultClass: rc }, join(tmp, rc + '.jsonl'));
      expect(r.ok).toBe(true);
    }
  });
});