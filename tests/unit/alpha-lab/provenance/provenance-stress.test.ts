/**
 * Empirical Stress & Adversarial Challenge Test Harness:
 * Provenance Research Ledger & Run Card Store
 *
 * Challenger: Challenger 1 (Milestone 4)
 * Target: src/alpha-lab/provenance/
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendLedgerRecord,
  readLedgerRecords,
  verifyLedgerChain,
  canonicalRecord,
  computeRecordHash,
  type LedgerRecord,
} from '../../../../src/alpha-lab/provenance/research-ledger';

import {
  hashConfig,
  canonicaliseConfig,
} from '../../../../src/alpha-lab/provenance/run-card-config';

import {
  writeRunCard,
  renderMarkdown,
} from '../../../../src/alpha-lab/provenance/run-card';

describe('Cryptographic Research Ledger & Run Card Store: Empirical Stress Harness', () => {
  let tmp: string;
  let ledgerPath: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'challenger-ledger-'));
    ledgerPath = join(tmp, 'research-ledger.jsonl');
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  // ============================================================================
  // Dimension 1: Unbroken SHA-256 Chain Verification (50+ Sequential Records)
  // ============================================================================
  describe('Dimension 1: Unbroken SHA-256 Chain across 60 sequential records', () => {
    it('generates 60 sequential records and verifies unbroken cryptographic chain', async () => {
      const recordCount = 60;
      for (let i = 0; i < recordCount; i++) {
        const res = await appendLedgerRecord(
          {
            runId: `run-${i.toString().padStart(3, '0')}`,
            configHash: `hash-${i}`,
            resultClass: i % 2 === 0 ? 'IS' : 'OOS',
            strategyRef: `strategy-${i % 5}`,
            lifecycleState: 'DISCOVERED',
            gates: {
              sharpeHurdle: i % 3 !== 0,
              drawdownHurdle: true,
              regimeConsistency: i > 10,
            },
          },
          ledgerPath,
        );
        expect(res.ok).toBe(true);
      }

      const records = await readLedgerRecords(ledgerPath);
      expect(records).toHaveLength(recordCount);

      // Verify record 0 prevHash is empty string
      expect(records[0]?.prevHash).toBe('');
      expect(records[0]?.entryHash).toMatch(/^[0-9a-f]{64}$/);

      // Verify every subsequent record chains directly to previous canonical hash
      for (let i = 1; i < recordCount; i++) {
        const current = records[i]!;
        const previous = records[i - 1]!;
        const expectedPrevHash = computeRecordHash(previous);

        expect(current.prevHash).toBe(expectedPrevHash);
        expect(current.entryHash).toBe(computeRecordHash(current));
        expect(current.prevHash).toMatch(/^[0-9a-f]{64}$/);
        expect(current.entryHash).toMatch(/^[0-9a-f]{64}$/);
      }

      // Chain verification must report intact chain (-1)
      expect(verifyLedgerChain(records)).toBe(-1);
    });
  });

  // ============================================================================
  // Dimension 2: Tamper Detection & Index Reporting Precision
  // ============================================================================
  describe('Dimension 2: Tamper Detection & Index Reporting Precision', () => {
    const totalRecords = 50;

    async function seedChain(count: number): Promise<LedgerRecord[]> {
      for (let i = 0; i < count; i++) {
        await appendLedgerRecord(
          {
            runId: `seed-${i.toString().padStart(2, '0')}`,
            configHash: `cfg-hash-${i}`,
            resultClass: 'IS',
            strategyRef: `strat-${i}`,
            lifecycleState: 'DISCOVERED',
            gates: { gateA: true, gateB: i % 2 === 0 },
          },
          ledgerPath,
        );
      }
      return readLedgerRecords(ledgerPath);
    }

    it('analyzes tamper detection at index 0', async () => {
      const records = await seedChain(totalRecords);
      expect(verifyLedgerChain(records)).toBe(-1);

      // Tamper payload field of record 0
      const tampered = structuredClone(records);
      tampered[0]!.strategyRef = 'tampered-strategy-0';

      // Empirical observation of verifyLedgerChain return index
      const flaggedIndex = verifyLedgerChain(tampered);

      // Note: Because record 0 entryHash mismatches, verifyLedgerChain returns (0 + 1 < 50 ? 1 : 0) = 1
      // It flags index 1 (the broken link / forward recipient), NOT index 0!
      expect(flaggedIndex).not.toBe(-1);
      expect(flaggedIndex).toBe(1);
    });

    it('analyzes tamper detection at intermediate index 25', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[25]!.strategyRef = 'tampered-strategy-25';

      const flaggedIndex = verifyLedgerChain(tampered);

      // Note: Because record 25 entryHash mismatches, verifyLedgerChain returns (25 + 1 < 50 ? 26 : 25) = 26
      expect(flaggedIndex).not.toBe(-1);
      expect(flaggedIndex).toBe(26);
    });

    it('analyzes tamper detection at final index (49)', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[49]!.strategyRef = 'tampered-strategy-49';

      const flaggedIndex = verifyLedgerChain(tampered);

      // At terminal record (49), 49 + 1 < 50 is false, so it returns 49!
      expect(flaggedIndex).toBe(49);
    });
  });

  // ============================================================================
  // Dimension 3: Corrupted prevHash vs entryHash vs Payload Fields
  // ============================================================================
  describe('Dimension 3: Corrupted prevHash vs entryHash vs Payload Fields', () => {
    const totalRecords = 50;

    async function seedChain(count: number): Promise<LedgerRecord[]> {
      for (let i = 0; i < count; i++) {
        await appendLedgerRecord(
          {
            runId: `run-${i}`,
            configHash: `hash-${i}`,
            resultClass: 'IS',
            strategyRef: `strat-${i}`,
            gates: { ok: true },
          },
          ledgerPath,
        );
      }
      return readLedgerRecords(ledgerPath);
    }

    it('corrupting prevHash at index 0 flags index 0', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[0]!.prevHash = 'corrupted-non-empty-hash';

      // Record 0 expectedPrev is '', so prevHash !== '' triggers at i=0 -> returns 0
      expect(verifyLedgerChain(tampered)).toBe(0);
    });

    it('corrupting prevHash at intermediate index 25 flags index 25', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[25]!.prevHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      // Record 25 prevHash !== expectedPrev triggers at i=25 -> returns 25
      expect(verifyLedgerChain(tampered)).toBe(25);
    });

    it('corrupting prevHash at final index 49 flags index 49', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[49]!.prevHash = 'bad-final-prev-hash';

      expect(verifyLedgerChain(tampered)).toBe(49);
    });

    it('corrupting entryHash directly at index 25 flags index 26', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[25]!.entryHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      // EntryHash mismatch triggers i + 1 = 26
      expect(verifyLedgerChain(tampered)).toBe(26);
    });

    it('modifying gates boolean at index 25 changes calculatedSelf and flags index 26', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[25]!.gates = { ok: false };

      expect(verifyLedgerChain(tampered)).toBe(26);
    });

    it('modifying strategyRef at index 25 flags index 26', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);
      tampered[25]!.strategyRef = 'injected-adversarial-strategy';

      expect(verifyLedgerChain(tampered)).toBe(26);
    });

    it('adversarial attack: modifying final record AND re-computing entryHash bypasses chain check', async () => {
      const records = await seedChain(totalRecords);
      const tampered = structuredClone(records);

      // Attacker modifies final record payload AND re-calculates entryHash
      tampered[49]!.strategyRef = 'malicious-injected-alpha';
      tampered[49]!.resultClass = 'LIVE';
      tampered[49]!.entryHash = computeRecordHash(tampered[49]!);

      // Because prevHash still points to record 48, and entryHash matches the tampered payload,
      // and there is no record 50 chaining from record 49:
      // verifyLedgerChain returns -1! The tampering of the final record is completely undetected!
      const outcome = verifyLedgerChain(tampered);
      expect(outcome).toBe(-1); // Critical security limitation discovered!
    });
  });

  // ============================================================================
  // Dimension 4: Empty Ledger File and Non-Existent File Handling
  // ============================================================================
  describe('Dimension 4: Empty Ledger File and Non-Existent File Handling', () => {
    it('handles non-existent file path safely without throwing', async () => {
      const nonExistent = join(tmp, 'does-not-exist.jsonl');
      const records = await readLedgerRecords(nonExistent);
      expect(records).toEqual([]);
      expect(verifyLedgerChain(records)).toBe(-1);
    });

    it('handles empty 0-byte ledger file safely', async () => {
      const emptyFile = join(tmp, 'empty.jsonl');
      await writeFile(emptyFile, '', 'utf8');

      const records = await readLedgerRecords(emptyFile);
      expect(records).toEqual([]);
      expect(verifyLedgerChain(records)).toBe(-1);
    });

    it('handles whitespace-only ledger file safely', async () => {
      const whitespaceFile = join(tmp, 'whitespace.jsonl');
      await writeFile(whitespaceFile, '   \n\n\t  \r\n', 'utf8');

      const records = await readLedgerRecords(whitespaceFile);
      expect(records).toEqual([]);
      expect(verifyLedgerChain(records)).toBe(-1);
    });

    it('handles single-record ledger correctly', async () => {
      const singleFile = join(tmp, 'single.jsonl');
      await appendLedgerRecord(
        { runId: 'single-1', configHash: 'c1', resultClass: 'IS', strategyRef: 's1', gates: {} },
        singleFile,
      );

      const records = await readLedgerRecords(singleFile);
      expect(records).toHaveLength(1);
      expect(records[0]?.prevHash).toBe('');
      expect(verifyLedgerChain(records)).toBe(-1);

      // Tampering single record entryHash
      records[0]!.entryHash = 'corrupted';
      // At index 0 when length is 1, 0 + 1 < 1 is false -> returns 0
      expect(verifyLedgerChain(records)).toBe(0);
    });
  });

  // ============================================================================
  // Dimension 5: Concurrent Ledger Append Stress
  // ============================================================================
  describe('Dimension 5: Concurrent Ledger Append Stress', () => {
    it('empirically reveals race condition when appendLedgerRecord is called concurrently without queue', async () => {
      const unmanagedLedger = join(tmp, 'unmanaged.jsonl');
      const concurrentCount = 15;

      // Fire 15 concurrent appends simultaneously without serialization
      const promises = Array.from({ length: concurrentCount }, (_, i) =>
        appendLedgerRecord(
          {
            runId: `concurrent-${i}`,
            configHash: `hash-${i}`,
            resultClass: 'IS',
            strategyRef: `strat-${i}`,
            gates: {},
          },
          unmanagedLedger,
        ),
      );

      const results = await Promise.all(promises);
      expect(results.every((r) => r.ok)).toBe(true);

      const records = await readLedgerRecords(unmanagedLedger);
      expect(records).toHaveLength(concurrentCount);

      // In an unmanaged concurrent environment, multiple records read the same prevHash,
      // breaking the hash chain!
      const chainValid = verifyLedgerChain(records);
      // We expect chain verification to FAIL (chainValid !== -1) because of race conditions!
      // This proves that raw appendLedgerRecord requires serialization (like pipeline's ledgerQueue).
      expect(chainValid).not.toBe(-1);
    });

    it('verifies that a serialized Promise queue prevents race conditions across 50 concurrent appends', async () => {
      const managedLedger = join(tmp, 'managed-queue.jsonl');
      const totalConcurrent = 50;

      // Simulate the serialized queue pattern used in AlphaLabAutonomousPipeline
      let queue: Promise<void> = Promise.resolve();
      function queuedAppend(
        input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>,
      ) {
        return new Promise((resolve) => {
          queue = queue.then(async () => {
            const res = await appendLedgerRecord(input, managedLedger);
            resolve(res);
          });
        });
      }

      const concurrentAppends = Array.from({ length: totalConcurrent }, (_, i) =>
        queuedAppend({
          runId: `queued-${i.toString().padStart(2, '0')}`,
          configHash: `cfg-${i}`,
          resultClass: 'IS',
          strategyRef: `strat-${i}`,
          gates: { passed: true },
        }),
      );

      await Promise.all(concurrentAppends);

      const records = await readLedgerRecords(managedLedger);
      expect(records).toHaveLength(totalConcurrent);

      // With serialization, the chain MUST be 100% intact
      expect(verifyLedgerChain(records)).toBe(-1);

      // Verify each record sequentially chains
      for (let i = 1; i < totalConcurrent; i++) {
        expect(records[i]!.prevHash).toBe(computeRecordHash(records[i - 1]!));
      }
    });
  });

  // ============================================================================
  // Dimension 6: Run Card Deterministic Config Hash Stress
  // ============================================================================
  describe('Dimension 6: Run Card Deterministic Config Hash Stress', () => {
    it('produces identical SHA-256 hash regardless of root key insertion order', () => {
      const config1 = {
        symbol: 'BTC/USDT',
        timeframe: '1h',
        lookback: 20,
        threshold: 1.5,
        family: 'momentumBreakout',
      };

      const config2 = {
        family: 'momentumBreakout',
        threshold: 1.5,
        lookback: 20,
        timeframe: '1h',
        symbol: 'BTC/USDT',
      };

      expect(hashConfig(config1)).toBe(hashConfig(config2));
      expect(hashConfig(config1)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces identical SHA-256 hash across deeply nested (6+ levels) structures with shuffled keys', () => {
      const deepConfigA = {
        level1: {
          beta: 2,
          alpha: 1,
          level2: {
            delta: 4,
            gamma: 3,
            level3: {
              zeta: 6,
              epsilon: 5,
              level4: {
                theta: 8,
                eta: 7,
                level5: {
                  kappa: 10,
                  iota: 9,
                  level6: {
                    mu: [1, 2, 3],
                    lambda: 'final',
                  },
                },
              },
            },
          },
        },
      };

      const deepConfigB = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    lambda: 'final',
                    mu: [1, 2, 3],
                  },
                  iota: 9,
                  kappa: 10,
                },
                eta: 7,
                theta: 8,
              },
              epsilon: 5,
              zeta: 6,
            },
            gamma: 3,
            delta: 4,
          },
          alpha: 1,
          beta: 2,
        },
      };

      expect(hashConfig(deepConfigA)).toBe(hashConfig(deepConfigB));
      expect(canonicaliseConfig(deepConfigA)).toBe(canonicaliseConfig(deepConfigB));
    });

    it('strips undefined values at all nesting levels', () => {
      const withUndefined = {
        a: 1,
        b: undefined,
        nested: {
          c: 'keep',
          d: undefined,
          deeper: {
            e: true,
            f: undefined,
          },
        },
      };

      const withoutUndefined = {
        a: 1,
        nested: {
          c: 'keep',
          deeper: {
            e: true,
          },
        },
      };

      expect(hashConfig(withUndefined)).toBe(hashConfig(withoutUndefined));
    });

    it('produces distinct hashes for subtly different values', () => {
      const base = { param: 1.0000001, mode: 'conservative' };
      const diff1 = { param: 1.0000002, mode: 'conservative' };
      const diff2 = { param: 1.0000001, mode: 'adverse' };

      const hashBase = hashConfig(base);
      const hashDiff1 = hashConfig(diff1);
      const hashDiff2 = hashConfig(diff2);

      expect(hashBase).not.toBe(hashDiff1);
      expect(hashBase).not.toBe(hashDiff2);
      expect(hashDiff1).not.toBe(hashDiff2);
    });

    it('handles arrays of nested objects deterministically', () => {
      const cfgA = {
        splits: [
          { train: 100, val: 20 },
          { train: 200, val: 40 },
        ],
      };
      const cfgB = {
        splits: [
          { val: 20, train: 100 },
          { val: 40, train: 200 },
        ],
      };

      expect(hashConfig(cfgA)).toBe(hashConfig(cfgB));
    });

    it('writes run cards to disk with deterministic config hashes and markdown rendering', async () => {
      const cardDir1 = join(tmp, 'card-1');
      const cardDir2 = join(tmp, 'card-2');

      const inputA = {
        runId: 'deterministic-run',
        resultClass: 'SURVIVED' as const,
        strategyRef: 'strat-alpha',
        hypothesis: 'Mean reversion alpha hypothesis',
        dataSources: ['binance:BTC/USDT:1h'],
        metrics: { sharpe: 1.85, maxDrawdown: 0.08 },
        config: { zScoreWindow: 20, exitZScore: 0.5, entryZScore: 2.0 },
      };

      const inputB = {
        runId: 'deterministic-run',
        resultClass: 'SURVIVED' as const,
        strategyRef: 'strat-alpha',
        hypothesis: 'Mean reversion alpha hypothesis',
        dataSources: ['binance:BTC/USDT:1h'],
        metrics: { sharpe: 1.85, maxDrawdown: 0.08 },
        config: { entryZScore: 2.0, exitZScore: 0.5, zScoreWindow: 20 },
      };

      const cardA = await writeRunCard(cardDir1, inputA);
      const cardB = await writeRunCard(cardDir2, inputB);

      expect(cardA.configHash).toBe(cardB.configHash);
      expect(cardA.schemaVersion).toBe('1.0.0');

      const mdContent = await readFile(join(cardDir1, 'run_card.md'), 'utf8');
      expect(mdContent).toContain(cardA.configHash);
      expect(mdContent).toContain('SURVIVED');
      expect(mdContent).toContain('binance:BTC/USDT:1h');
    });
  });
});
