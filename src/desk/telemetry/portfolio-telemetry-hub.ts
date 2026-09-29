/**
 * Portfolio Telemetry Hub
 * Master hub coordinating cross-engine telemetry ingestion, PnL attribution, and EOD archival.
 */

import { ENGINE_IDS, type EngineId } from '../portfolio/types';
import { AccountingReconciler, type ZeroDriftResult } from './accounting-reconciler';
import { EodRiskLedger } from './eod-risk-ledger';
import { EodRunCardGenerator } from './eod-run-card-generator';
import { PortfolioMetricsRecorder } from './portfolio-metrics';
import { RoceCalculator } from './roce-calculator';
import { TELEMETRY_TOPICS, TelemetryEventBus } from './telemetry-event-bus';
import type {
  ConsolidatedPortfolioSnapshot,
  EngineTelemetrySnapshot,
  ProvenanceRunCard,
  RiskLedgerEntry,
} from './telemetry-types';

export class PortfolioTelemetryHub {
  private unallocatedCashUsd: number;
  private readonly engineSnapshots: Record<EngineId, EngineTelemetrySnapshot>;
  public readonly eventBus: TelemetryEventBus;
  public readonly reconciler: AccountingReconciler;
  public readonly ledger: EodRiskLedger;

  constructor(options?: {
    initialCashUsd?: number;
    eventBus?: TelemetryEventBus;
    reconciler?: AccountingReconciler;
    ledger?: EodRiskLedger;
  }) {
    this.unallocatedCashUsd = options?.initialCashUsd ?? 20000;
    this.eventBus = options?.eventBus ?? new TelemetryEventBus();
    this.reconciler = options?.reconciler ?? new AccountingReconciler();
    this.ledger = options?.ledger ?? new EodRiskLedger();

    this.engineSnapshots = {} as Record<EngineId, EngineTelemetrySnapshot>;
    for (const id of ENGINE_IDS) {
      this.engineSnapshots[id] = {
        engineId: id,
        allocatedCapitalUsd: 0,
        mtmPnlUsd: 0,
        marginUsedUsd: 0,
        tradeCount: 0,
        realizedPnlUsd: 0,
        unrealizedPnlUsd: 0,
      };
    }
  }

  public setUnallocatedCash(cashUsd: number): void {
    this.unallocatedCashUsd = Math.max(0, cashUsd);
  }

  public setEngineAllocatedCapital(engineId: EngineId, capitalUsd: number): void {
    const existing = this.engineSnapshots[engineId];
    if (existing) {
      this.engineSnapshots[engineId] = {
        ...existing,
        allocatedCapitalUsd: Math.max(0, capitalUsd),
      };
    }
  }

  public ingestEngineSnapshot(snapshot: EngineTelemetrySnapshot): void {
    this.engineSnapshots[snapshot.engineId] = { ...snapshot };
    this.eventBus.emit(TELEMETRY_TOPICS.PNL, {
      engineId: snapshot.engineId,
      mtmPnlUsd: snapshot.mtmPnlUsd,
      marginUsedUsd: snapshot.marginUsedUsd,
    });
  }

  public ingestEngineTrade(engineId: EngineId, pnlDeltaUsd: number, marginDeltaUsd = 0): void {
    const current = this.engineSnapshots[engineId];
    if (!current) return;
    this.engineSnapshots[engineId] = {
      ...current,
      mtmPnlUsd: current.mtmPnlUsd + pnlDeltaUsd,
      marginUsedUsd: Math.max(0, current.marginUsedUsd + marginDeltaUsd),
      tradeCount: current.tradeCount + 1,
      realizedPnlUsd: (current.realizedPnlUsd ?? 0) + pnlDeltaUsd,
    };
  }

  public getConsolidatedSnapshot(): ConsolidatedPortfolioSnapshot {
    const snapshots = { ...this.engineSnapshots };
    const allocatedCapitalUsd = Object.values(snapshots).reduce(
      (sum, s) => sum + s.allocatedCapitalUsd,
      0
    );
    const totalMtmPnlUsd = Object.values(snapshots).reduce(
      (sum, s) => sum + s.mtmPnlUsd,
      0
    );
    const totalMarginUsedUsd = Object.values(snapshots).reduce(
      (sum, s) => sum + s.marginUsedUsd,
      0
    );

    const totalEquityUsd = this.unallocatedCashUsd + allocatedCapitalUsd + totalMtmPnlUsd;
    const marginUtilizationRatio =
      totalEquityUsd > 0 ? totalMarginUsedUsd / totalEquityUsd : 0;
    const grossLeverage =
      totalEquityUsd > 0 ? (allocatedCapitalUsd + totalMarginUsedUsd) / totalEquityUsd : 0;
    const { roceAnnualized } = RoceCalculator.computeRoce(
      totalMtmPnlUsd,
      allocatedCapitalUsd,
      30
    );

    const tempSnapshot: ConsolidatedPortfolioSnapshot = {
      timestamp: Date.now(),
      totalEquityUsd,
      unallocatedCashUsd: this.unallocatedCashUsd,
      allocatedCapitalUsd,
      totalMtmPnlUsd,
      grossLeverage,
      marginUtilizationRatio,
      roceAnnualized,
      accountingDriftUsd: 0,
      engineSnapshots: snapshots,
    };

    const recon = this.reconciler.reconcileSnapshot(tempSnapshot);
    const finalSnapshot: ConsolidatedPortfolioSnapshot = {
      ...tempSnapshot,
      accountingDriftUsd: recon.driftUsd,
    };

    this.eventBus.emit(TELEMETRY_TOPICS.SNAPSHOT, finalSnapshot);
    PortfolioMetricsRecorder.recordSnapshot(finalSnapshot);

    if (!recon.isZeroDrift) {
      this.eventBus.emit(TELEMETRY_TOPICS.ALERT, {
        type: 'ACCOUNTING_DRIFT',
        driftUsd: recon.driftUsd,
        timestamp: finalSnapshot.timestamp,
      });
    }

    return finalSnapshot;
  }

  public verifyBalance(): ZeroDriftResult {
    const snapshot = this.getConsolidatedSnapshot();
    return this.reconciler.reconcileSnapshot(snapshot);
  }

  public archiveEod(
    dateStr?: string,
    outputDir = 'data/provenance'
  ): { ledgerEntry: RiskLedgerEntry; runCard: ProvenanceRunCard } {
    const snapshot = this.getConsolidatedSnapshot();
    const ledgerEntry = this.ledger.appendPortfolioSnapshot(snapshot, snapshot.timestamp);
    const integrity = this.ledger.verifyEodLedgerChain();
    const runCard = EodRunCardGenerator.generateAndSaveRunCard(
      this.ledger.getRecords(),
      integrity.isValid,
      snapshot,
      dateStr,
      outputDir
    );

    this.eventBus.emit(TELEMETRY_TOPICS.EOD, {
      date: runCard.date,
      ledgerEntry,
      runCardId: runCard.runCardId,
      integrity: integrity.isValid,
    });

    return { ledgerEntry, runCard };
  }
}
