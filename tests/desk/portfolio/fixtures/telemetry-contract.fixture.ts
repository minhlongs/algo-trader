import { createHmac } from 'node:crypto';
import type { EngineId } from '../../../../src/desk/portfolio/types';

export interface EngineTelemetrySnapshot {
  readonly engineId: EngineId;
  readonly allocatedCapitalUsd: number;
  readonly mtmPnlUsd: number;
  readonly marginUsedUsd: number;
  readonly tradeCount: number;
}

export interface ConsolidatedPortfolioSnapshot {
  readonly timestamp: number;
  readonly totalEquityUsd: number;
  readonly unallocatedCashUsd: number;
  readonly allocatedCapitalUsd: number;
  readonly totalMtmPnlUsd: number;
  readonly grossLeverage: number;
  readonly marginUtilizationRatio: number;
  readonly roceAnnualized: number;
  readonly accountingDriftUsd: number;
  readonly engineSnapshots: Readonly<Record<EngineId, EngineTelemetrySnapshot>>;
}

export interface RiskLedgerRecord {
  readonly sequenceNumber: number;
  readonly timestamp: number;
  readonly totalNavUsd: number;
  readonly allocations: Record<EngineId, number>;
  readonly pnlSnapshot: Record<EngineId, number>;
  readonly prevHash: string;
  readonly currentHash: string;
}

export class AccountingReconciler {
  public static verifyZeroDrift(
    portfolioEquity: number,
    unallocatedCash: number,
    engineCapitals: Record<EngineId, number>,
    enginePnls: Record<EngineId, number>,
    tolerance = 1e-4
  ): { isZeroDrift: boolean; driftUsd: number } {
    const totalEngineSum = Object.keys(engineCapitals).reduce((sum, key) => {
      const id = key as EngineId;
      return sum + (engineCapitals[id] ?? 0) + (enginePnls[id] ?? 0);
    }, 0);

    const calculatedTotal = unallocatedCash + totalEngineSum;
    const driftUsd = Math.abs(portfolioEquity - calculatedTotal);
    return {
      isZeroDrift: driftUsd <= tolerance,
      driftUsd,
    };
  }
}

export class RoceCalculator {
  public static computeRoce(
    totalPnlUsd: number,
    capitalEmployedUsd: number,
    daysElapsed = 30
  ): { roce: number; roceAnnualized: number } {
    if (capitalEmployedUsd <= 0) return { roce: 0, roceAnnualized: 0 };
    const roce = totalPnlUsd / capitalEmployedUsd;
    const annualMultiplier = daysElapsed > 0 ? 365 / daysElapsed : 1;
    const roceAnnualized = roce * annualMultiplier;
    return { roce, roceAnnualized };
  }
}

export class TelemetryEventBus {
  private events: { topic: string; payload: unknown; timestamp: number }[] = [];

  public emit(topic: string, payload: unknown): void {
    this.events.push({ topic, payload, timestamp: Date.now() });
  }

  public getEvents(topicFilter?: string): readonly { topic: string; payload: unknown; timestamp: number }[] {
    if (!topicFilter) return this.events;
    return this.events.filter((e) => e.topic.startsWith(topicFilter));
  }
}

export class EodRiskLedger {
  private records: RiskLedgerRecord[] = [];
  private readonly secretKey: string;

  constructor(secretKey = 'test-audit-key') {
    this.secretKey = secretKey;
  }

  public appendSnapshot(
    totalNavUsd: number,
    allocations: Record<EngineId, number>,
    pnlSnapshot: Record<EngineId, number>,
    timestamp = Date.now()
  ): RiskLedgerRecord {
    const prevHash = this.records.length > 0
      ? this.records[this.records.length - 1].currentHash
      : 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000';

    const sequenceNumber = this.records.length + 1;
    const payload = `${sequenceNumber}:${timestamp}:${totalNavUsd}:${JSON.stringify(allocations)}:${JSON.stringify(pnlSnapshot)}:${prevHash}`;
    const currentHash = createHmac('sha256', this.secretKey).update(payload).digest('hex');

    const record: RiskLedgerRecord = {
      sequenceNumber,
      timestamp,
      totalNavUsd,
      allocations,
      pnlSnapshot,
      prevHash,
      currentHash,
    };
    this.records.push(record);
    return record;
  }

  public verifyChainIntegrity(): { isValid: boolean; corruptedIndex?: number } {
    for (let i = 0; i < this.records.length; i++) {
      const rec = this.records[i];
      const expectedPrev = i > 0
        ? this.records[i - 1].currentHash
        : 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000';

      if (rec.prevHash !== expectedPrev) {
        return { isValid: false, corruptedIndex: i };
      }

      const payload = `${rec.sequenceNumber}:${rec.timestamp}:${rec.totalNavUsd}:${JSON.stringify(rec.allocations)}:${JSON.stringify(rec.pnlSnapshot)}:${rec.prevHash}`;
      const recomputedHash = createHmac('sha256', this.secretKey).update(payload).digest('hex');

      if (rec.currentHash !== recomputedHash) {
        return { isValid: false, corruptedIndex: i };
      }
    }
    return { isValid: true };
  }

  public generateMarkdownRunCard(): string {
    const lines = [
      '# End-of-Day Risk Ledger Run-Card',
      '',
      `Total Snapshots: ${this.records.length}`,
      `Ledger Integrity: ${this.verifyChainIntegrity().isValid ? 'VERIFIED' : 'COMPROMISED'}`,
      '',
      '| Seq | NAV ($) | Current Hash | Prev Hash |',
      '|-----|---------|--------------|-----------|',
    ];
    for (const r of this.records) {
      lines.push(`| ${r.sequenceNumber} | ${r.totalNavUsd.toFixed(2)} | ${r.currentHash.slice(0, 8)}... | ${r.prevHash.slice(0, 8)}... |`);
    }
    return lines.join('\n');
  }
}
