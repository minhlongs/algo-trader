import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
} from '../../../../src/alpha-lab/provenance/research-ledger';
import { writeRunCard, hashConfig } from '../../../../src/alpha-lab/provenance/run-card';
import { createTempDir } from '../fixtures/test-helpers';

export function registerTier1ProvenanceTests(): void {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    tempDirObj = await createTempDir();
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  describe('Feature 16: Research Provenance Ledger (F16)', () => {
    it('F16.1: appends experiment records to append-only JSONL research ledger', async () => {
      const file = join(tempDirObj.path, 'ledger.jsonl');
      const res = await appendLedgerRecord({
        runId: 'run-1', configHash: 'hash-1', strategyRef: 'strat-1',
        resultClass: 'SURVIVED', recordedAt: new Date().toISOString(),
        gates: { g1: true },
      }, file);
      expect(res.ok).toBe(true);
      const records = await readLedgerRecords(file);
      expect(records.length).toBe(1);
    });

    it('F16.2: cryptographically chains SHA-256 prevHash from previous ledger record', async () => {
      const file = join(tempDirObj.path, 'ledger-chain.jsonl');
      await appendLedgerRecord({
        runId: 'r1', configHash: 'h1', strategyRef: 's1', resultClass: 'SURVIVED', gates: {},
      }, file);
      await appendLedgerRecord({
        runId: 'r2', configHash: 'h2', strategyRef: 's1', resultClass: 'SURVIVED', gates: {},
      }, file);
      const records = await readLedgerRecords(file);
      expect(records[0]?.prevHash).toBe('');
      expect(records[1]?.prevHash).not.toBe('');
      expect(records[1]?.prevHash.length).toBe(64);
    });

    it('F16.3: verifies unbroken ledger hash chain returning valid integrity verdict', async () => {
      const file = join(tempDirObj.path, 'valid-chain.jsonl');
      for (let i = 0; i < 3; i++) {
        await appendLedgerRecord({
          runId: `run-${i}`, configHash: `hash-${i}`, strategyRef: 'strat-1',
          resultClass: 'SURVIVED', gates: { g: true },
        }, file);
      }
      const records = await readLedgerRecords(file);
      const verified = verifyLedgerChain(records);
      expect(verified).toBe(-1);
    });

    it('F16.4: detects single-byte tampering in ledger record returning corrupted index', async () => {
      const file = join(tempDirObj.path, 'tamper-chain.jsonl');
      for (let i = 0; i < 3; i++) {
        await appendLedgerRecord({
          runId: `run-${i}`, configHash: `hash-${i}`, strategyRef: 'strat-1',
          resultClass: 'SURVIVED', gates: {},
        }, file);
      }
      const content = await readFile(file, 'utf-8');
      const lines = content.trim().split('\n');
      const tamperedRecord = JSON.parse(lines[1]!);
      tamperedRecord.strategyRef = 'tampered-strategy';
      lines[1] = JSON.stringify(tamperedRecord);
      await writeFile(file, lines.join('\n') + '\n', 'utf-8');
      const records = await readLedgerRecords(file);
      const verified = verifyLedgerChain(records);
      expect(verified).toBeGreaterThanOrEqual(1);
    });

    it('F16.5: gracefully returns empty array when ledger file does not yet exist', async () => {
      const nonExistent = join(tempDirObj.path, 'ghost-ledger.jsonl');
      const records = await readLedgerRecords(nonExistent);
      expect(records).toEqual([]);
    });
  });

  describe('Feature 17: Immutable Run-Card Store (F17)', () => {
    it('F17.1: writes run_card.json with canonical schema version 1.0.0', async () => {
      const card = await writeRunCard(tempDirObj.path, {
        runId: 'rc-1', resultClass: 'SURVIVED', strategyRef: 'strat-1',
        dataSources: ['binance:BTC/USDT:1h'], metrics: { sharpeRatio: 1.85 },
        config: { symbol: 'BTC/USDT', timeframe: '1h' },
      });
      expect(card.schemaVersion).toBe('1.0.0');
      const fileContent = await readFile(join(tempDirObj.path, 'run_card.json'), 'utf-8');
      const parsed = JSON.parse(fileContent);
      expect(parsed.runId).toBe('rc-1');
    });

    it('F17.2: writes dual run_card.md rendered in clean, readable Markdown tables', async () => {
      await writeRunCard(tempDirObj.path, {
        runId: 'rc-md', resultClass: 'SURVIVED', strategyRef: 'strat-1',
        dataSources: ['binance:BTC/USDT:1h'], metrics: { sharpeRatio: 1.85 },
        config: { symbol: 'BTC/USDT', timeframe: '1h' },
      });
      const md = await readFile(join(tempDirObj.path, 'run_card.md'), 'utf-8');
      expect(md).toContain('# Run Card — rc-md');
      expect(md).toContain('| Metric | Value |');
    });

    it('F17.3: computes deterministic configuration hash regardless of object key order', () => {
      const cfgA = { z: 10, a: 'test', b: [1, 2] };
      const cfgB = { a: 'test', b: [1, 2], z: 10 };
      expect(hashConfig(cfgA)).toBe(hashConfig(cfgB));
    });

    it('F17.4: records backtest metrics, gate outcomes, and diagnostics into run card', async () => {
      const card = await writeRunCard(tempDirObj.path, {
        runId: 'rc-gates', resultClass: 'SURVIVED', strategyRef: 'strat-1',
        dataSources: ['binance:BTC/USDT:1h'], metrics: { sharpeRatio: 2.1 },
        config: { symbol: 'BTC/USDT', timeframe: '1h' },
        gateResults: [{ gateId: 'sharpe', passed: true, observedValue: 2.1, threshold: 1.5 }],
      });
      expect(card.gateResults?.length).toBe(1);
      expect(card.gateResults?.[0]?.passed).toBe(true);
    });

    it('F17.5: handles fail-safe error recording without crashing on invalid paths', async () => {
      const invalidPath = '/invalid_path_impossible_no_permission/rc';
      const card = await writeRunCard(invalidPath, {
        runId: 'rc-err', resultClass: 'REJECTED', strategyRef: 'strat-fail',
        dataSources: [], metrics: {}, config: {},
      });
      expect(card.writeError).toBeDefined();
    });
  });
}
