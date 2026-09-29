/**
 * Automated End-of-Day (EOD) Immutable Risk Ledger
 * Persists daily portfolio risk & PnL snapshots with SHA-256 HMAC hash chaining.
 */

import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../shared/utils/logger';
import type { EngineId } from '../portfolio/types';
import type { ConsolidatedPortfolioSnapshot, RiskLedgerEntry } from './telemetry-types';

export const GENESIS_PREV_HASH =
  'GENESIS_0000000000000000000000000000000000000000000000000000000000000000';

export class EodRiskLedger {
  private readonly records: RiskLedgerEntry[] = [];
  private readonly secretKey: string;
  private readonly ledgerFilePath: string;

  constructor(
    secretKey = process.env.AUDIT_HMAC_SECRET || 'desk-eod-audit-key',
    ledgerFilePath = 'data/eod-risk-ledger.jsonl'
  ) {
    this.secretKey = secretKey;
    this.ledgerFilePath = ledgerFilePath;
  }

  public getRecords(): readonly RiskLedgerEntry[] {
    return [...this.records];
  }

  public appendSnapshot(
    totalNavUsd: number,
    allocations: Record<EngineId, number>,
    pnlSnapshot: Record<EngineId, number>,
    timestamp = Date.now(),
    extra?: { unallocatedCashUsd?: number; marginUtilizationRatio?: number; grossLeverage?: number }
  ): RiskLedgerEntry {
    const sequenceNumber = this.records.length + 1;
    const prevHash = this.records.length > 0
      ? this.records[this.records.length - 1].currentHash
      : GENESIS_PREV_HASH;

    const payload = `${sequenceNumber}:${timestamp}:${totalNavUsd}:${JSON.stringify(allocations)}:${JSON.stringify(pnlSnapshot)}:${prevHash}`;
    const currentHash = createHmac('sha256', this.secretKey).update(payload).digest('hex');

    const entry: RiskLedgerEntry = {
      sequenceNumber,
      timestamp,
      date: new Date(timestamp).toISOString().split('T')[0],
      totalNavUsd,
      allocations,
      pnlSnapshot,
      prevHash,
      currentHash,
      unallocatedCashUsd: extra?.unallocatedCashUsd,
      marginUtilizationRatio: extra?.marginUtilizationRatio,
      grossLeverage: extra?.grossLeverage,
    };

    this.records.push(entry);
    this.persistEntry(entry);
    return entry;
  }

  public appendPortfolioSnapshot(
    snapshot: ConsolidatedPortfolioSnapshot,
    timestamp = Date.now()
  ): RiskLedgerEntry {
    const allocations: Record<EngineId, number> = {} as Record<EngineId, number>;
    const pnlSnapshot: Record<EngineId, number> = {} as Record<EngineId, number>;

    for (const [id, s] of Object.entries(snapshot.engineSnapshots)) {
      allocations[id as EngineId] = s.allocatedCapitalUsd;
      pnlSnapshot[id as EngineId] = s.mtmPnlUsd;
    }

    return this.appendSnapshot(
      snapshot.totalEquityUsd,
      allocations,
      pnlSnapshot,
      timestamp,
      {
        unallocatedCashUsd: snapshot.unallocatedCashUsd,
        marginUtilizationRatio: snapshot.marginUtilizationRatio,
        grossLeverage: snapshot.grossLeverage,
      }
    );
  }

  public verifyEodLedgerChain(): { isValid: boolean; corruptedIndex?: number; reason?: string } {
    for (let i = 0; i < this.records.length; i++) {
      const rec = this.records[i];
      const expectedPrev = i > 0 ? this.records[i - 1].currentHash : GENESIS_PREV_HASH;

      if (rec.prevHash !== expectedPrev) {
        return { isValid: false, corruptedIndex: i, reason: 'prevHash mismatch' };
      }

      const payload = `${rec.sequenceNumber}:${rec.timestamp}:${rec.totalNavUsd}:${JSON.stringify(rec.allocations)}:${JSON.stringify(rec.pnlSnapshot)}:${rec.prevHash}`;
      const recomputedHash = createHmac('sha256', this.secretKey).update(payload).digest('hex');

      if (rec.currentHash !== recomputedHash) {
        return { isValid: false, corruptedIndex: i, reason: 'currentHash mismatch' };
      }
    }
    return { isValid: true };
  }

  public verifyChainIntegrity(): { isValid: boolean; corruptedIndex?: number } {
    const res = this.verifyEodLedgerChain();
    return { isValid: res.isValid, corruptedIndex: res.corruptedIndex };
  }

  public generateMarkdownRunCard(): string {
    const integrity = this.verifyEodLedgerChain();
    const lines = [
      '# End-of-Day Risk Ledger Run-Card',
      '',
      `- Total Snapshots: ${this.records.length}`,
      `- Ledger Integrity: ${integrity.isValid ? 'VERIFIED' : 'COMPROMISED'}`,
      '',
      '| Seq | NAV ($) | Current Hash | Prev Hash |',
      '|-----|---------|--------------|-----------|',
    ];

    for (const r of this.records) {
      lines.push(
        `| ${r.sequenceNumber} | ${r.totalNavUsd.toFixed(2)} | \`${r.currentHash.slice(0, 16)}...\` | \`${r.prevHash.slice(0, 16)}...\` |`
      );
    }
    return lines.join('\n');
  }

  private persistEntry(entry: RiskLedgerEntry): void {
    try {
      if (typeof process !== 'undefined' && process.versions?.node && this.ledgerFilePath) {
        const dir = path.dirname(this.ledgerFilePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.appendFileSync(this.ledgerFilePath, JSON.stringify(entry) + '\n', 'utf-8');
      }
    } catch (e) {
      logger.warn('Failed to append risk ledger record to file', { error: String(e) });
    }
  }
}
