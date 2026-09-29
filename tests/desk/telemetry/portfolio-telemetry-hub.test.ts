import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { PortfolioTelemetryHub } from '../../../src/desk/telemetry/portfolio-telemetry-hub';
import { TELEMETRY_TOPICS } from '../../../src/desk/telemetry/telemetry-event-bus';

describe('PortfolioTelemetryHub', () => {
  const testOutputDir = 'data/test-hub-provenance';

  afterEach(() => {
    try {
      if (fs.existsSync(testOutputDir)) {
        fs.rmSync(testOutputDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore
    }
  });

  it('aggregates initial engine allocations and cash buffer', () => {
    const hub = new PortfolioTelemetryHub({ initialCashUsd: 25000 });
    hub.setEngineAllocatedCapital('arbitrage', 20000);
    hub.setEngineAllocatedCapital('marl', 20000);
    hub.setEngineAllocatedCapital('amm', 20000);
    hub.setEngineAllocatedCapital('alpha-lab', 20000);

    const snapshot = hub.getConsolidatedSnapshot();
    expect(snapshot.unallocatedCashUsd).toBe(25000);
    expect(snapshot.allocatedCapitalUsd).toBe(80000);
    expect(snapshot.totalEquityUsd).toBe(105000);
    expect(snapshot.accountingDriftUsd).toBe(0);
  });

  it('ingests engine snapshot and updates consolidated state', () => {
    const hub = new PortfolioTelemetryHub({ initialCashUsd: 20000 });
    hub.ingestEngineSnapshot({
      engineId: 'arbitrage',
      allocatedCapitalUsd: 20000,
      mtmPnlUsd: 1500,
      marginUsedUsd: 5000,
      tradeCount: 12,
    });

    const snapshot = hub.getConsolidatedSnapshot();
    expect(snapshot.totalMtmPnlUsd).toBe(1500);
    expect(snapshot.totalEquityUsd).toBe(20000 + 20000 + 1500);
    expect(snapshot.engineSnapshots.arbitrage.tradeCount).toBe(12);
  });

  it('ingests trade updates and accumulates PnL and trade count', () => {
    const hub = new PortfolioTelemetryHub({ initialCashUsd: 20000 });
    hub.setEngineAllocatedCapital('marl', 20000);

    hub.ingestEngineTrade('marl', 250, 1000);
    hub.ingestEngineTrade('marl', -50, 500);

    const snapshot = hub.getConsolidatedSnapshot();
    expect(snapshot.engineSnapshots.marl.mtmPnlUsd).toBe(200);
    expect(snapshot.engineSnapshots.marl.tradeCount).toBe(2);
    expect(snapshot.engineSnapshots.marl.marginUsedUsd).toBe(1500);
  });

  it('reconciles portfolio balance with zero accounting drift', () => {
    const hub = new PortfolioTelemetryHub({ initialCashUsd: 20000 });
    hub.setEngineAllocatedCapital('arbitrage', 20000);
    hub.setEngineAllocatedCapital('marl', 20000);
    hub.setEngineAllocatedCapital('amm', 20000);
    hub.setEngineAllocatedCapital('alpha-lab', 20000);

    const recon = hub.verifyBalance();
    expect(recon.isZeroDrift).toBe(true);
    expect(recon.driftUsd).toBeLessThan(1e-4);
  });

  it('emits telemetry snapshot and pnl events on bus', () => {
    const hub = new PortfolioTelemetryHub({ initialCashUsd: 20000 });
    const pnlHandler = vi.fn();
    const snapshotHandler = vi.fn();

    hub.eventBus.on(TELEMETRY_TOPICS.PNL, pnlHandler);
    hub.eventBus.on(TELEMETRY_TOPICS.SNAPSHOT, snapshotHandler);

    hub.ingestEngineSnapshot({
      engineId: 'amm',
      allocatedCapitalUsd: 25000,
      mtmPnlUsd: 300,
      marginUsedUsd: 4000,
      tradeCount: 8,
    });

    expect(pnlHandler).toHaveBeenCalledTimes(1);

    hub.getConsolidatedSnapshot();
    expect(snapshotHandler).toHaveBeenCalledTimes(1);
  });

  it('executes automated EOD archival and creates ledger entry + run-card', () => {
    const hub = new PortfolioTelemetryHub({ initialCashUsd: 30000 });
    hub.setEngineAllocatedCapital('arbitrage', 20000);
    hub.setEngineAllocatedCapital('marl', 20000);
    hub.setEngineAllocatedCapital('amm', 20000);
    hub.setEngineAllocatedCapital('alpha-lab', 20000);

    const { ledgerEntry, runCard } = hub.archiveEod('2026-09-28', testOutputDir);
    expect(ledgerEntry.sequenceNumber).toBe(1);
    expect(ledgerEntry.totalNavUsd).toBe(110000);
    expect(runCard.runCardId).toBe('eod-risk-run-card-2026-09-28');
    expect(runCard.chainIntegrityValid).toBe(true);

    const eodEvents = hub.eventBus.getEvents(TELEMETRY_TOPICS.EOD);
    expect(eodEvents.length).toBe(1);
  });
});
