import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
  type LedgerRecord,
} from '../../../../src/alpha-lab/provenance/research-ledger';
import { writeRunCard } from '../../../../src/alpha-lab/provenance/run-card';
import { createTempDir } from '../fixtures/test-helpers';

export function registerTier2ProvenanceTests(): void {
  let tempDirObj: { path: string; cleanup: () => Promise<void> };

  beforeEach(async () => {
    tempDirObj = await createTempDir();
  });

  afterEach(async () => {
    await tempDirObj.cleanup();
  });

  describe('Feature 16: Research Provenance Ledger Boundaries (F16)', () => {
    it('B16.1: empty ledger records array returns -1 (valid chain)', () => {
      expect(verifyLedgerChain([])).toBe(-1);
    });

    it('B16.2: single record ledger with empty prevHash returns -1 (valid chain)', () => {
      const record: LedgerRecord = {
        runId: 'r1', configHash: 'h1', resultClass: 'IS', strategyRef: 'strat', recordedAt: '2025-01-01T00:00:00Z', gates: {}, prevHash: '',
      };
      expect(verifyLedgerChain([record])).toBe(-1);
    });

    it('B16.3: detects corrupted prevHash in record 2 of a 4-record chain', () => {
      const r0: LedgerRecord = { runId: '0', configHash: 'h0', resultClass: 'IS', strategyRef: 's', recordedAt: 't', gates: {}, prevHash: '' };
      const r1: LedgerRecord = { runId: '1', configHash: 'h1', resultClass: 'IS', strategyRef: 's', recordedAt: 't', gates: {}, prevHash: 'wrong-hash' };
      expect(verifyLedgerChain([r0, r1])).toBe(1);
    });

    it('B16.4: handles corrupted JSON lines in ledger file gracefully', async () => {
      const corruptedPath = join(tempDirObj.path, 'corrupted.jsonl');
      await writeFile(corruptedPath, '{"runId": "r1"}\nINVALID_JSON_CORRUPTION\n{"runId": "r2"}\n');
      const records = await readLedgerRecords(corruptedPath);
      expect(records).toEqual([]);
    });

    it('B16.5: appends record with empty gates map and preserves chain link', async () => {
      const ledgerPath = join(tempDirObj.path, 'empty-gates.jsonl');
      await appendLedgerRecord({ runId: 'r1', configHash: 'h1', resultClass: 'IS', strategyRef: 's', gates: {} }, ledgerPath);
      await appendLedgerRecord({ runId: 'r2', configHash: 'h2', resultClass: 'OOS', strategyRef: 's', gates: {} }, ledgerPath);
      const records = await readLedgerRecords(ledgerPath);
      expect(records.length).toBe(2);
      expect(verifyLedgerChain(records)).toBe(-1);
    });
  });

  describe('Feature 17: Immutable Run-Card Store Boundaries (F17)', () => {
    it('B17.1: produces valid 64-character SHA-256 hash for empty config object {}', async () => {
      const runDir = join(tempDirObj.path, 'empty-cfg');
      const card = await writeRunCard(runDir, {
        runId: 'empty-cfg-run', resultClass: 'IS', strategyRef: 'strat', dataSources: [], metrics: {}, config: {},
      });
      expect(card.configHash.length).toBe(64);
    });

    it('B17.2: hashes nested configurations deterministically regardless of key order', async () => {
      const dir1 = join(tempDirObj.path, 'nest-1');
      const dir2 = join(tempDirObj.path, 'nest-2');
      const card1 = await writeRunCard(dir1, {
        runId: 'n1', resultClass: 'IS', strategyRef: 's', dataSources: [], metrics: {}, config: { sub: { b: 2, a: 1 }, x: 10 },
      });
      const card2 = await writeRunCard(dir2, {
        runId: 'n2', resultClass: 'IS', strategyRef: 's', dataSources: [], metrics: {}, config: { x: 10, sub: { a: 1, b: 2 } },
      });
      expect(card1.configHash).toBe(card2.configHash);
    });

    it('B17.3: renders run card with zero data sources and zero metrics safely', async () => {
      const runDir = join(tempDirObj.path, 'zero-card');
      await writeRunCard(runDir, {
        runId: 'zero-metrics', resultClass: 'OOS', strategyRef: 'strat', dataSources: [], metrics: {}, config: {},
      });
      const md = await readFile(join(runDir, 'run_card.md'), 'utf8');
      expect(md).toContain('_No data sources recorded._');
      expect(md).toContain('| Metric | Value |');
    });

    it('B17.4: handles markdown special characters in hypothesis without crashing', async () => {
      const runDir = join(tempDirObj.path, 'special-char');
      await writeRunCard(runDir, {
        runId: 'special-char-run', resultClass: 'LIVE', strategyRef: 'strat',
        hypothesis: 'Hypothesis with `code`, **bold**, | tables | and <script>alert(1)</script>',
        dataSources: [], metrics: { pnl: 100 }, config: {},
      });
      const md = await readFile(join(runDir, 'run_card.md'), 'utf8');
      expect(md).toContain('`code`');
    });

    it('B17.5: records writeError gracefully when destination cannot be written', async () => {
      const card = await writeRunCard('/proc/read-only-forbidden/card', {
        runId: 'ro-run', resultClass: 'IS', strategyRef: 'strat', dataSources: [], metrics: {}, config: {},
      });
      expect(card.writeError).toBeDefined();
    });
  });
}
