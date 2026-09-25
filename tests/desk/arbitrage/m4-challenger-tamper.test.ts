/**
 * Milestone 4 Empirical Adversarial Challenge Test Suite:
 * Cryptographic Tamper Resistance & Hash-Chain Integrity Stress Testing (Requirement R4).
 *
 * Verifies:
 * 1. 20-record unbroken baseline chain across full arbitrage execution lifecycle.
 * 2. Tamper detection: mutation of entry metadata, result, or metadata timestamp in the middle of chain.
 * 3. Sequence manipulation: deletion of entries, swapping sequence numbers, swapping array positions.
 * 4. PreviousHash tampering: corruption of previousHash at middle of chain, corruption of genesis previousHash.
 * 5. Key rotation & HMAC key isolation: verification against divergent/invalid HMAC keys.
 * 6. Edge cases: empty chains, single-record chains, tail truncation, and top-level timestamp attack surface.
 *
 * @module tests/desk/arbitrage/m4-challenger-tamper.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  ArbitrageAuditLogger,
  type ChainedAuditRow,
} from '../../../src/desk/arbitrage/telemetry/arbitrage-audit-logger';

// Mock logAudit to isolate cryptographic chain verification from DB availability
vi.mock('../../../src/seed/security/audit-log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  hashIpAddress: vi.fn().mockImplementation((ip: string) =>
    crypto.createHash('sha256').update(ip).digest('hex'),
  ),
}));

describe('Milestone 4 Challenger: Cryptographic Tamper Resistance of ArbitrageAuditLogger', () => {
  let auditLogger: ArbitrageAuditLogger;
  let testKey: Buffer;

  // Helper to construct a typed reference to private chain for adversarial manipulations
  function getInternalChain(logger: ArbitrageAuditLogger): ChainedAuditRow[] {
    return (logger as unknown as { chain: ChainedAuditRow[] }).chain;
  }

  // Populate an empirical 20-record chain spanning the complete arbitrage lifecycle
  async function populate20RecordChain(logger: ArbitrageAuditLogger): Promise<void> {
    logger.clear();
    for (let i = 1; i <= 4; i++) {
      // 1. Opportunity Ingested
      await logger.logOpportunityIngested(
        {
          id: `opp-stress-${i}`,
          symbol: i % 2 === 0 ? 'ETH/USDT' : 'BTC/USDT',
          buyVenue: 'binance',
          sellVenue: 'bybit',
          buyPrice: 60000 + i * 10,
          sellPrice: 60100 + i * 10,
          spreadBps: 16.6,
          netProfitBps: 12.4,
        },
        { opportunityTimestamp: Date.now() + i * 100 },
      );

      // 2. Order Submitted
      await logger.logOrderSubmitted({
        orderId: `ord-stress-${i}`,
        opportunityId: `opp-stress-${i}`,
        symbol: i % 2 === 0 ? 'ETH/USDT' : 'BTC/USDT',
        legsCount: 2,
        totalNotionalUsd: 10000 + i * 500,
        executionMode: 'concurrent',
      });

      // 3. Order Filled or Risk Rejected or Unwound or Failed
      if (i === 1) {
        // Leg filled successfully
        await logger.logOrderFilled({
          executionId: `ord-stress-${i}`,
          opportunityId: `opp-stress-${i}`,
          state: 'FILLED',
          netRealizedPnlUsd: 24.5,
          latencyMs: 14,
        });
      } else if (i === 2) {
        // Pre-trade risk rejection
        await logger.logRiskRejected({
          opportunityId: `opp-stress-${i}`,
          reason: 'Daily drawdown breaker triggered at 15.2%',
          rule: 'DRAWDOWN_BREAKER',
          symbol: 'ETH/USDT',
        });
      } else if (i === 3) {
        // Compensatory unwind
        await logger.logOrderUnwound({
          executionId: `ord-stress-${i}`,
          unwindId: `unwind-stress-${i}`,
          success: true,
          unwindCostUsd: 3.2,
          unhedgedResidualDelta: 0,
        });
      } else {
        // Terminal failure
        await logger.logOrderFailed(
          `ord-stress-${i}`,
          'Venue websocket disconnected during quote confirmation',
        );
      }

      // 4. Secondary lifecycle telemetry
      await logger.logOpportunityIngested({
        id: `opp-monitor-${i}`,
        symbol: 'SOL/USDT',
        buyPrice: 140,
        sellPrice: 140.8,
        spreadBps: 57,
        netProfitBps: 35,
      });

      // 5. Execution record
      await logger.logOrderFilled({
        executionId: `ord-monitor-${i}`,
        opportunityId: `opp-monitor-${i}`,
        state: 'FILLED',
        netRealizedPnlUsd: 18.2,
        latencyMs: 12,
      });
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    testKey = crypto.randomBytes(32);
    auditLogger = new ArbitrageAuditLogger('127.0.0.1', testKey);
    await populate20RecordChain(auditLogger);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 1: Baseline Chain Validation
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Baseline 20-Record Lifecycle Chain Validation', () => {
    it('creates an unbroken 20-record chain with valid HMAC hashes and linkages', () => {
      const history = auditLogger.getAuditHistory();
      expect(history.length).toBe(20);

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(20);
      expect(verification.brokenAt).toBeUndefined();
      expect(verification.reason).toBeUndefined();

      // Check genesis linkage
      expect(history[0].sequenceNumber).toBe(1);
      expect(history[0].previousHash).toBe('');
      expect(history[0].hash).toMatch(/^[0-9a-f]{64}$/);

      // Check contiguous hash linkages from sequence 2 to 20
      for (let i = 1; i < 20; i++) {
        expect(history[i].sequenceNumber).toBe(i + 1);
        expect(history[i].previousHash).toBe(history[i - 1].hash);
        expect(history[i].hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 2: Tamper Detection (Mutations in the Middle of Chain)
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Tamper Detection: Middle-of-Chain Mutation (Record 10)', () => {
    it('immediately detects corruption when entry metadata is mutated in record 10', () => {
      const chain = getInternalChain(auditLogger);
      expect(chain.length).toBe(20);

      // Record 10 is at index 9 (sequenceNumber 10)
      const targetRow = chain[9];
      expect(targetRow.sequenceNumber).toBe(10);

      // Adversary mutates trade notional / prices inside metadata
      targetRow.entry.metadata.tamperedField = 'adulterated_value_99999';

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(10);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch at sequence 10: row corrupted or tampered');
      expect(verification.totalRecords).toBe(20);
    });

    it('immediately detects corruption when entry result is altered in record 10', () => {
      const chain = getInternalChain(auditLogger);
      const targetRow = chain[9];
      expect(targetRow.sequenceNumber).toBe(10);

      // Adversary alters execution result from 'success' to 'failure'
      const originalResult = targetRow.entry.result;
      targetRow.entry.result = originalResult === 'success' ? 'failure' : 'success';

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(10);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch at sequence 10: row corrupted or tampered');
    });

    it('immediately detects corruption when metadata timestamp is mutated in record 10', () => {
      const chain = getInternalChain(auditLogger);
      // In record 1 (index 0) or any record with metadata timestamp
      const rowWithMetaTs = chain[0];
      expect(rowWithMetaTs.sequenceNumber).toBe(1);
      expect(rowWithMetaTs.entry.metadata.opportunityTimestamp).toBeDefined();

      rowWithMetaTs.entry.metadata.opportunityTimestamp = 999999999999;

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch at sequence 1: row corrupted or tampered');
    });

    it('immediately detects corruption when entry action or resource is mutated in record 10', () => {
      const chain = getInternalChain(auditLogger);
      const targetRow = chain[9];

      // Mutate action
      targetRow.entry.action = 'arb.order.tampered_action';

      const verificationAction = auditLogger.verifyChainIntegrity();
      expect(verificationAction.valid).toBe(false);
      expect(verificationAction.brokenAt).toBe(10);
      expect(verificationAction.reason).toContain('Cryptographic HMAC mismatch at sequence 10');

      // Reset action, mutate resource
      targetRow.entry.action = 'arb.risk.rejected';
      targetRow.entry.resource = 'arbitrage/unauthorized_resource';

      const verificationResource = auditLogger.verifyChainIntegrity();
      expect(verificationResource.valid).toBe(false);
      expect(verificationResource.brokenAt).toBe(10);
      expect(verificationResource.reason).toContain('Cryptographic HMAC mismatch at sequence 10');
    });

    it('empirically demonstrates perimeter limit: top-level entry.timestamp is outside computeRowHash payload', () => {
      const chain = getInternalChain(auditLogger);
      const targetRow = chain[9];
      expect(targetRow.sequenceNumber).toBe(10);

      // Directly alter top-level entry.timestamp
      const originalTs = targetRow.entry.timestamp;
      targetRow.entry.timestamp = '1970-01-01T00:00:00.000Z';

      // computeRowHash from src/seed/security/audit-hash-chain.ts hashes:
      // tid | sequenceNumber | previousHash | (id | action | resource | result | metaJson)
      // Because top-level entry.timestamp is not in the HMAC payload, verifyChainIntegrity remains valid.
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);

      // Restore timestamp to clean state
      targetRow.entry.timestamp = originalTs;
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 3: Sequence Manipulation (Deletion & Swapping)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Sequence Manipulation Stress Tests', () => {
    it('detects entry deletion in the middle of the chain (record 10 deleted)', () => {
      const chain = getInternalChain(auditLogger);
      expect(chain.length).toBe(20);

      // Adversary removes record 10 (index 9) to hide an unauthorized fill or rejection
      const [removedRow] = chain.splice(9, 1);
      expect(removedRow.sequenceNumber).toBe(10);
      expect(chain.length).toBe(19);

      // Row at index 9 now has sequenceNumber 11, but expected sequence is 10
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(11);
      expect(verification.reason).toBe('Broken sequence: expected 10, received 11');
      expect(verification.totalRecords).toBe(19);
    });

    it('detects deletion of the genesis record (record 1 deleted)', () => {
      const chain = getInternalChain(auditLogger);
      chain.splice(0, 1);
      expect(chain.length).toBe(19);

      // Index 0 now has sequenceNumber 2, but expected sequence is 1
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(2);
      expect(verification.reason).toBe('Broken sequence: expected 1, received 2');
    });

    it('detects sequence number swapping between adjacent records (records 10 & 11 swapped)', () => {
      const chain = getInternalChain(auditLogger);

      // Adversary swaps sequence numbers of records 10 and 11
      chain[9].sequenceNumber = 11;
      chain[10].sequenceNumber = 10;

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(11);
      expect(verification.reason).toBe('Broken sequence: expected 10, received 11');
    });

    it('detects physical array swapping of records 10 and 11', () => {
      const chain = getInternalChain(auditLogger);

      // Swap positions in array
      const temp = chain[9];
      chain[9] = chain[10];
      chain[10] = temp;

      // Now index 9 holds sequenceNumber 11 instead of 10
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(11);
      expect(verification.reason).toBe('Broken sequence: expected 10, received 11');
    });

    it('detects swapped records even when sequence numbers are artificially patched', () => {
      const chain = getInternalChain(auditLogger);

      // Swap positions in array
      const temp = chain[9];
      chain[9] = chain[10];
      chain[10] = temp;

      // Adversary patches sequenceNumber so sequence continuity passes (10, 11)
      chain[9].sequenceNumber = 10;
      chain[10].sequenceNumber = 11;

      // Verification fails immediately on previousHash linkage at sequence 10!
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(10);
      expect(verification.reason).toBe('Previous hash mismatch at sequence 10');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 4: PreviousHash Tampering
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. PreviousHash Linkage Tampering', () => {
    it('detects corruption when previousHash is altered in the middle of chain (record 10)', () => {
      const chain = getInternalChain(auditLogger);
      expect(chain.length).toBe(20);

      // Alter previousHash of record 10
      chain[9].previousHash = 'a'.repeat(64);

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(10);
      expect(verification.reason).toBe('Previous hash mismatch at sequence 10');
    });

    it('detects corruption when genesis previousHash is forged with a non-empty string', () => {
      const chain = getInternalChain(auditLogger);

      // Genesis previousHash must be empty string ''
      chain[0].previousHash = '0'.repeat(64);

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
      expect(verification.reason).toBe('Previous hash mismatch at sequence 1');
    });

    it('detects when an adversary modifies a row hash directly', () => {
      const chain = getInternalChain(auditLogger);

      // Corrupt hash of record 10
      chain[9].hash = 'f'.repeat(64);

      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(10);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch at sequence 10: row corrupted or tampered');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 5: Key Rotation & HMAC Key Isolation
  // ──────────────────────────────────────────────────────────────────────────
  describe('5. HMAC Key Rotation & Key Isolation Verification', () => {
    it('fails verification at sequence 1 when tested against a different HMAC key', () => {
      const differentKey = crypto.randomBytes(32);
      const rogueVerifier = new ArbitrageAuditLogger('127.0.0.1', differentKey);

      // Load original 20-record chain into the rogue verifier
      const rogueChain = getInternalChain(rogueVerifier);
      for (const row of auditLogger.getAuditHistory()) {
        rogueChain.push(row);
      }

      // Must fail on sequence 1 because recomputed HMAC under differentKey !== original hash
      const verification = rogueVerifier.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch at sequence 1: row corrupted or tampered');
      expect(verification.totalRecords).toBe(20);
    });

    it('produces cryptographically uncorrelated hashes across distinct keys for identical payloads', async () => {
      const keyA = crypto.randomBytes(32);
      const keyB = crypto.randomBytes(32);

      const loggerA = new ArbitrageAuditLogger('127.0.0.1', keyA);
      const loggerB = new ArbitrageAuditLogger('127.0.0.1', keyB);

      const opp = { id: 'opp-deterministic-test', symbol: 'BTC/USDT', buyPrice: 50000, sellPrice: 50100 };
      const rowA = await loggerA.logOpportunityIngested(opp);
      const rowB = await loggerB.logOpportunityIngested(opp);

      expect(rowA.hash).not.toBe(rowB.hash);
      expect(rowA.sequenceNumber).toBe(rowB.sequenceNumber);
      expect(rowA.previousHash).toBe(rowB.previousHash); // Both '' for genesis
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 6: Boundary Conditions & Edge Cases
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Boundary Conditions & Edge Case Stress Testing', () => {
    it('correctly handles an empty chain', () => {
      const emptyLogger = new ArbitrageAuditLogger('127.0.0.1', testKey);
      emptyLogger.clear();

      const verification = emptyLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(0);
      expect(verification.brokenAt).toBeUndefined();
    });

    it('correctly verifies a single-record chain and detects single-record tampering', async () => {
      const singleLogger = new ArbitrageAuditLogger('127.0.0.1', testKey);
      await singleLogger.logOpportunityIngested({ id: 'opp-single' });

      expect(singleLogger.verifyChainIntegrity().valid).toBe(true);
      expect(singleLogger.verifyChainIntegrity().totalRecords).toBe(1);

      // Tamper single record
      const chain = getInternalChain(singleLogger);
      chain[0].entry.metadata.tampered = true;

      const verification = singleLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
      expect(verification.reason).toContain('Cryptographic HMAC mismatch at sequence 1');
    });

    it('demonstrates tail truncation vulnerability: removing trailing records leaves valid prefix', () => {
      const chain = getInternalChain(auditLogger);
      expect(chain.length).toBe(20);

      // Adversary truncates records 16-20 (tail truncation attack)
      chain.splice(15, 5);
      expect(chain.length).toBe(15);

      // The remaining 15 records form a valid prefix unless anchored externally
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBe(15);
    });

    it('detects insertion of an unauthorized duplicate record into the chain', () => {
      const chain = getInternalChain(auditLogger);

      // Adversary duplicates record 10 and inserts it at position 11
      const duplicateRow = { ...chain[9] };
      chain.splice(10, 0, duplicateRow);
      expect(chain.length).toBe(21);

      // Sequence check fails because record 11 has sequenceNumber 10
      const verification = auditLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(10);
      expect(verification.reason).toBe('Broken sequence: expected 11, received 10');
    });

    it('empirically reveals race condition vulnerability under concurrent logging', async () => {
      const raceLogger = new ArbitrageAuditLogger('127.0.0.1', testKey);

      // Concurrently dispatch multiple append operations
      await Promise.all([
        raceLogger.logOpportunityIngested({ id: 'opp-race-1' }),
        raceLogger.logOpportunityIngested({ id: 'opp-race-2' }),
      ]);

      const history = raceLogger.getAuditHistory();
      expect(history.length).toBe(2);

      // Because appendRow performs async logAudit before pushing to chain,
      // both concurrent calls allocate sequenceNumber = 1 and previousHash = ''
      const hasDuplicateSequence = history[0].sequenceNumber === history[1].sequenceNumber;
      expect(hasDuplicateSequence).toBe(true);

      const verification = raceLogger.verifyChainIntegrity();
      expect(verification.valid).toBe(false);
      expect(verification.brokenAt).toBe(1);
      expect(verification.reason).toContain('Broken sequence');
    });
  });
});
