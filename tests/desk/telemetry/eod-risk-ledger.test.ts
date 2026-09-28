import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EodRiskLedger, GENESIS_PREV_HASH } from '../../../src/desk/telemetry/eod-risk-ledger';

describe('EodRiskLedger', () => {
  const testLedgerPath = 'data/test-eod-ledger.jsonl';

  afterEach(() => {
    try {
      if (fs.existsSync(testLedgerPath)) {
        fs.unlinkSync(testLedgerPath);
      }
    } catch {
      // Ignore
    }
  });

  it('creates a genesis record with valid initial prevHash', () => {
    const ledger = new EodRiskLedger('test-key', testLedgerPath);
    const rec = ledger.appendSnapshot(
      100000,
      { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
    );

    expect(rec.sequenceNumber).toBe(1);
    expect(rec.prevHash).toBe(GENESIS_PREV_HASH);
    expect(rec.currentHash.length).toBe(64);
  });

  it('cryptographically chains sequential records with HMAC SHA-256', () => {
    const ledger = new EodRiskLedger('test-key', testLedgerPath);
    const r1 = ledger.appendSnapshot(
      100000,
      { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
    );
    const r2 = ledger.appendSnapshot(
      102000,
      { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
      { arbitrage: 500, marl: 500, amm: 500, 'alpha-lab': 500 }
    );

    expect(r2.prevHash).toBe(r1.currentHash);
    expect(r2.sequenceNumber).toBe(2);
  });

  it('verifies unbroken chain integrity with verifyEodLedgerChain()', () => {
    const ledger = new EodRiskLedger('test-key', testLedgerPath);
    for (let i = 1; i <= 5; i++) {
      ledger.appendSnapshot(
        100000 + i * 1000,
        { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
        { arbitrage: 100, marl: 100, amm: 100, 'alpha-lab': 100 }
      );
    }
    const check = ledger.verifyEodLedgerChain();
    expect(check.isValid).toBe(true);
    expect(ledger.verifyChainIntegrity().isValid).toBe(true);
  });

  it('detects tampering in middle record', () => {
    const ledger = new EodRiskLedger('test-key', testLedgerPath);
    for (let i = 1; i <= 5; i++) {
      const rec = ledger.appendSnapshot(
        100000 + i * 1000,
        { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
        { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      if (i === 3) {
        // Tamper with record value
        (rec as { totalNavUsd: number }).totalNavUsd = 999999;
      }
    }
    const check = ledger.verifyEodLedgerChain();
    expect(check.isValid).toBe(false);
    expect(check.corruptedIndex).toBe(2);
  });

  it('returns isValid: true on empty ledger', () => {
    const ledger = new EodRiskLedger('test-key', testLedgerPath);
    expect(ledger.verifyEodLedgerChain().isValid).toBe(true);
  });

  it('generates markdown run-card from ledger records', () => {
    const ledger = new EodRiskLedger('test-key', testLedgerPath);
    ledger.appendSnapshot(
      100000,
      { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
      { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 }
    );
    const md = ledger.generateMarkdownRunCard();
    expect(md).toContain('# End-of-Day Risk Ledger Run-Card');
    expect(md).toContain('Total Snapshots: 1');
    expect(md).toContain('VERIFIED');
  });
});
