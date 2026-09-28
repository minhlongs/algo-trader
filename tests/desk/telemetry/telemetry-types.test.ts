import { describe, it, expect } from 'vitest';
import {
  EngineTelemetrySnapshotSchema,
  ConsolidatedPortfolioSnapshotSchema,
  PnLAttributionSchema,
  MarginUtilizationSchema,
  RoceReportSchema,
  RiskLedgerEntrySchema,
  ProvenanceRunCardSchema,
} from '../../../src/desk/telemetry/telemetry-types';

describe('Telemetry Types & Zod Schemas', () => {
  it('validates a correct EngineTelemetrySnapshot', () => {
    const valid = {
      engineId: 'arbitrage',
      allocatedCapitalUsd: 25000,
      mtmPnlUsd: 1250,
      marginUsedUsd: 5000,
      tradeCount: 15,
      realizedPnlUsd: 1000,
      unrealizedPnlUsd: 250,
    };
    const parsed = EngineTelemetrySnapshotSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid engineId in EngineTelemetrySnapshot', () => {
    const invalid = {
      engineId: 'unknown_engine',
      allocatedCapitalUsd: 10000,
      mtmPnlUsd: 0,
      marginUsedUsd: 0,
      tradeCount: 0,
    };
    const parsed = EngineTelemetrySnapshotSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('validates a ConsolidatedPortfolioSnapshot', () => {
    const snapshot = {
      timestamp: Date.now(),
      totalEquityUsd: 105000,
      unallocatedCashUsd: 25000,
      allocatedCapitalUsd: 80000,
      totalMtmPnlUsd: 0,
      grossLeverage: 1.0,
      marginUtilizationRatio: 0.25,
      roceAnnualized: 0.15,
      accountingDriftUsd: 0,
      engineSnapshots: {
        arbitrage: {
          engineId: 'arbitrage',
          allocatedCapitalUsd: 20000,
          mtmPnlUsd: 0,
          marginUsedUsd: 5000,
          tradeCount: 10,
        },
        marl: {
          engineId: 'marl',
          allocatedCapitalUsd: 20000,
          mtmPnlUsd: 0,
          marginUsedUsd: 5000,
          tradeCount: 20,
        },
        amm: {
          engineId: 'amm',
          allocatedCapitalUsd: 20000,
          mtmPnlUsd: 0,
          marginUsedUsd: 5000,
          tradeCount: 15,
        },
        'alpha-lab': {
          engineId: 'alpha-lab',
          allocatedCapitalUsd: 20000,
          mtmPnlUsd: 0,
          marginUsedUsd: 5000,
          tradeCount: 5,
        },
      },
    };
    expect(ConsolidatedPortfolioSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('validates PnLAttributionSchema', () => {
    const attr = {
      engineId: 'amm',
      realizedPnlUsd: 500,
      unrealizedPnlUsd: 150,
      totalMtmPnlUsd: 650,
      netCashFlowUsd: 480,
      feesPaidUsd: 15,
      gasPaidUsd: 5,
      timestamp: Date.now(),
    };
    expect(PnLAttributionSchema.safeParse(attr).success).toBe(true);
  });

  it('validates MarginUtilizationSchema', () => {
    const margin = {
      engineId: 'marl',
      initialMarginUsd: 8000,
      maintenanceMarginUsd: 6000,
      totalMarginUsedUsd: 8000,
      capitalBaseUsd: 20000,
      marginUtilizationRatio: 0.40,
      grossLeverage: 1.5,
      warningThresholdBreached: false,
      criticalThresholdBreached: false,
    };
    expect(MarginUtilizationSchema.safeParse(margin).success).toBe(true);
  });

  it('validates RoceReportSchema', () => {
    const report = {
      engineId: 'alpha-lab',
      totalPnlUsd: 3000,
      capitalEmployedUsd: 25000,
      daysElapsed: 30,
      roce: 0.12,
      roceAnnualized: 1.46,
      timestamp: Date.now(),
    };
    expect(RoceReportSchema.safeParse(report).success).toBe(true);
  });

  it('validates RiskLedgerEntrySchema', () => {
    const entry = {
      sequenceNumber: 1,
      timestamp: Date.now(),
      totalNavUsd: 100000,
      allocations: { arbitrage: 25000, marl: 25000, amm: 25000, 'alpha-lab': 25000 },
      pnlSnapshot: { arbitrage: 100, marl: 200, amm: -50, 'alpha-lab': 300 },
      prevHash: 'GENESIS_0000000000000000000000000000000000000000000000000000000000000000',
      currentHash: 'a'.repeat(64),
    };
    expect(RiskLedgerEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('validates ProvenanceRunCardSchema', () => {
    const card = {
      runCardId: 'eod-risk-run-card-2026-09-28',
      date: '2026-09-28',
      generatedAt: Date.now(),
      totalSnapshots: 1,
      chainIntegrityValid: true,
      totalNavUsd: 105000,
      totalMtmPnlUsd: 5000,
      annualizedRoce: 0.25,
      markdownContent: '# Run Card',
    };
    expect(ProvenanceRunCardSchema.safeParse(card).success).toBe(true);
  });
});
