import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
import { createInMemoryAppendOnlyStore, DurableMarketBlindLedger, type MarketBlindAppendOnlyStore } from '../../src/desk/polymarket/market-blind/market-blind-ledger-store';
import { checkpointFor } from '../../src/desk/polymarket/market-blind/market-blind-journal';
import { ProspectivePipelineLedger, submitMarketBlindForecast, attachPostCommitMarketSnapshot, recordMarketBlindResolution } from '../../src/desk/polymarket/market-blind/market-blind-prospective-pipeline';
import { createNodeJsonlAppendStore } from '../../src/desk/polymarket/market-blind/node-market-blind-ledger-adapter';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function paths(): { path: string; checkpoint: string } {
  const root = mkdtempSync(join(tmpdir(), 'mb-journal-')); roots.push(root);
  return { path: join(root, 'ledger.jsonl'), checkpoint: join(root, 'separate-head', 'head.json') };
}
const commit = (ledger: ProspectivePipelineLedger, questionId = 'q1') => submitMarketBlindForecast(ledger, { questionId, modelVersion: 'model-v1', pRaw: 0.6, evidence: 'Official document.', committedAtMs: 1000 });
function durableInput(questionId = 'q1') { return { questionId, modelVersionId: 'model-v1', stateVariant: 'base', category: 'macro', pRaw: 0.6, loggedAtMs: 1000 }; }

describe('sealed journal and independent terminal checkpoint', () => {
  it.each(['tail', 'middle', 'reorder', 'duplicate', 'partial', 'head', 'missing-head', 'missing-ledger'] as const)('rejects %s loss or corruption against separate checkpoint', (kind) => {
    const { path, checkpoint } = paths(), store = createNodeJsonlAppendStore(path, checkpoint), ledger = new ProspectivePipelineLedger(store);
    for (const id of ['q1', 'q2', 'q3']) commit(ledger, id);
    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    if (kind === 'tail') writeFileSync(path, `${lines.slice(0, -1).join('\n')}\n`);
    if (kind === 'middle') writeFileSync(path, `${lines[0]}\n${lines[2]}\n`);
    if (kind === 'reorder') writeFileSync(path, `${lines[1]}\n${lines[0]}\n${lines[2]}\n`);
    if (kind === 'duplicate') appendFileSync(path, `${lines[2]}\n`);
    if (kind === 'partial') appendFileSync(path, '{"seq":3');
    if (kind === 'head') writeFileSync(checkpoint, JSON.stringify({ version: 1, recordCount: 2, headHash: 'f'.repeat(64), sealHash: '0'.repeat(64) }));
    if (kind === 'missing-head') unlinkSync(checkpoint);
    if (kind === 'missing-ledger') unlinkSync(path);
    expect(() => ProspectivePipelineLedger.hydrateFromStore(createNodeJsonlAppendStore(path, checkpoint))).toThrow(/INTEGRITY/);
    expect(ledger.verifyChainIntegrity()).toBe(false);
    expect(() => commit(ledger, 'q4')).toThrow(/INTEGRITY/);
  });
  it('never bootstraps an existing unanchored ledger or accepts its copy as strict evidence', () => {
    const original = paths(), copy = paths();
    commit(new ProspectivePipelineLedger(createNodeJsonlAppendStore(original.path, original.checkpoint)));
    copyFileSync(original.path, copy.path);
    expect(() => new ProspectivePipelineLedger(createNodeJsonlAppendStore(copy.path, copy.checkpoint))).toThrow(/no independently retained checkpoint/);
    expect(existsSync(copy.checkpoint)).toBe(false);
  });
  it('detects a partial append/checkpoint crash and keeps RAM unchanged, quarantining the writer', () => {
    const backing = createInMemoryAppendOnlyStore();
    const store: MarketBlindAppendOnlyStore = { ...backing, appendSealed(line): void { backing.appendLine(line); throw new Error('crash before checkpoint'); } };
    const ledger = new ProspectivePipelineLedger(store);
    expect(() => commit(ledger)).toThrow('crash before checkpoint');
    expect(ledger.commitsByHash.size).toBe(0);
    expect(ledger.recordCount()).toBe(0);
    expect(ledger.integrityVerified()).toBe(false);
    expect(() => commit(ledger, 'retry')).toThrow(/quarantined/);
    expect(() => new ProspectivePipelineLedger(backing)).toThrow(/checkpoint/);
  });
  it('rejects checkpoint-ahead crash and fabricated checkpoint seals', () => {
    const backing = createInMemoryAppendOnlyStore();
    backing.checkpointStore!.compareAndSwap(null, checkpointFor(1, 'f'.repeat(64)));
    expect(() => new ProspectivePipelineLedger(backing)).toThrow(/checkpoint/);
    const { path, checkpoint } = paths();
    mkdirSync(join(checkpoint, '..'), { recursive: true });
    writeFileSync(checkpoint, '{"version":1}');
    expect(() => new ProspectivePipelineLedger(createNodeJsonlAppendStore(path, checkpoint))).toThrow(/checkpoint/);
  });
  it('rejects stale multiwriters and refuses active/crash locks without stealing them', () => {
    const { path, checkpoint } = paths();
    const first = new ProspectivePipelineLedger(createNodeJsonlAppendStore(path, checkpoint));
    const stale = new ProspectivePipelineLedger(createNodeJsonlAppendStore(path, checkpoint));
    commit(first);
    expect(() => commit(stale, 'q2')).toThrow(/INTEGRITY/);
    const current = new ProspectivePipelineLedger(createNodeJsonlAppendStore(path, checkpoint));
    mkdirSync(`${path}.writer-lock`);
    expect(() => commit(current, 'q3')).toThrow(/INTEGRITY/);
    expect(existsSync(`${path}.writer-lock`)).toBe(true);
    expect(() => new ProspectivePipelineLedger(createNodeJsonlAppendStore(path, checkpoint))).toThrow(/lock/);
  });
  it('fails closed on a real filesystem checkpoint rename failure after the journal append', () => {
    const { path, checkpoint } = paths(), store = createNodeJsonlAppendStore(path, checkpoint);
    const ledger = new ProspectivePipelineLedger(store);
    vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('checkpoint rename failed'); });
    expect(() => commit(ledger)).toThrow('checkpoint rename failed');
    expect(readFileSync(path, 'utf8').trimEnd().split('\n')).toHaveLength(1);
    expect(existsSync(checkpoint)).toBe(false);
    expect(ledger.commitsByHash.size).toBe(0);
    expect(ledger.integrityVerified()).toBe(false);
    expect(() => new ProspectivePipelineLedger(createNodeJsonlAppendStore(path, checkpoint))).toThrow(/checkpoint/);
  });
  it('uses separate durable files with private modes and rejects identical paths', () => {
    const { path, checkpoint } = paths();
    const store = createNodeJsonlAppendStore(path, checkpoint);
    commit(new ProspectivePipelineLedger(store));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(checkpoint).mode & 0o777).toBe(0o600);
    expect(() => store.appendLine('{}')).toThrow(/Unsealed/);
    expect(() => createNodeJsonlAppendStore(path, path)).toThrow(/separate/);
    expect(() => createNodeJsonlAppendStore(' ')).toThrow(/non-empty/);
  });
  it('stages snapshot and resolution until their checkpoint succeeds', () => {
    for (const failureKind of ['MARKET_SNAPSHOT', 'RESOLUTION']) {
      const backing = createInMemoryAppendOnlyStore();
      let fail = false;
      const store: MarketBlindAppendOnlyStore = { ...backing, appendSealed(line, previous, next): void {
        if (fail) throw new Error(`failed ${failureKind}`);
        backing.appendSealed!(line, previous, next);
      } };
      const ledger = new ProspectivePipelineLedger(store), receipt = commit(ledger);
      if (failureKind === 'RESOLUTION') attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: 1100 });
      fail = true;
      const operation = failureKind === 'MARKET_SNAPSHOT' ? () => attachPostCommitMarketSnapshot(ledger, receipt, { marketProb: 0.5, marketReadAtMs: 1100 })
        : () => recordMarketBlindResolution(ledger, { entryHash: receipt.entryHash, status: 'RESOLVED_YES', resolvedAtMs: 2000 });
      expect(operation).toThrow(`failed ${failureKind}`);
      expect(ledger.resolutions.size).toBe(0);
      expect(ledger.snapshots.size).toBe(failureKind === 'RESOLUTION' ? 1 : 0);
      expect(ledger.integrityVerified()).toBe(false);
    }
  });
  it('also protects the legacy durable ledger from failed commit/resolution persistence and tail loss', () => {
    const backing = createInMemoryAppendOnlyStore(); let fail = false;
    const store: MarketBlindAppendOnlyStore = { ...backing, appendSealed(line, previous, next): void {
      if (fail) throw new Error('durable append failed');
      backing.appendSealed!(line, previous, next);
    } };
    const ledger = new DurableMarketBlindLedger(store), receipt = ledger.commitForecast(durableInput());
    const params = { receipt, outcome: 1 as const, marketPriceAtCommit: 0.5, marketObservedAtMs: 1100, resolvedAtMs: 2000 };
    ledger.recordResolution(params);
    expect(ledger.recordResolution(params)).toEqual(ledger.resolvedSamples()[0]);
    expect(ledger.recordCount()).toBe(2);
    expect(() => ledger.recordResolution({ ...params, outcome: 0 })).toThrow(/Conflicting/);
    fail = true;
    expect(() => ledger.commitForecast(durableInput('failed'))).toThrow('durable append failed');
    expect(ledger.entries()).toHaveLength(1);
    expect(ledger.verifyChainIntegrity()).toBe(false);
    const { path, checkpoint } = paths(), durable = new DurableMarketBlindLedger(createNodeJsonlAppendStore(path, checkpoint));
    durable.commitForecast(durableInput()); durable.commitForecast(durableInput('q2'));
    writeFileSync(path, `${readFileSync(path, 'utf8').split('\n')[0]}\n`);
    expect(() => DurableMarketBlindLedger.hydrateFromStore(createNodeJsonlAppendStore(path, checkpoint))).toThrow(/checkpoint/);
  });
});
