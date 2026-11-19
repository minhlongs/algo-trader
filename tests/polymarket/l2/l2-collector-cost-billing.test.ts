import { describe, expect, it } from 'vitest';
import { estimateL2CollectionStorageAndCost, type L2CostModelInput } from '../../../src/desk/polymarket/l2/l2-collector-cost-model';

const knownCosts: L2CostModelInput = {
  measuredBytes: 1_000_000_000,
  durationSec: 86400,
  measuredMarkets: 1,
  targetMarketTiers: [1],
  retentionDays: 1,
  vpsMonthlyUsdRange: [20, 20],
  backupAndMonitoringReserveMonthlyUsd: 1,
  bandwidthOverageMonthlyUsd: 2,
  taxMonthlyUsd: 0.5,
  dataLicenseMonthlyUsd: 0.25,
};

function project(overrides: Partial<L2CostModelInput> = {}) {
  return estimateL2CollectionStorageAndCost({ ...knownCosts, ...overrides }).projections[0]!;
}

describe('l2-collector-cost-billing boundaries', () => {
  it('includes backup/monitoring, bandwidth, tax, and licensing rather than treating direct R2 egress as all traffic', () => {
    const p = project();
    expect(p.r2StorageMonthlyUsd).toEqual({ min: 0.03, max: 0.03 });
    expect(p.totalMonthlyUsdRange).toEqual([28.64, 28.64]);
    expect(p.nonStorageCosts).toEqual({
      backupAndMonitoringReserveMonthlyUsd: 1,
      bandwidthOverageMonthlyUsd: 2,
      taxMonthlyUsd: 0.5,
      dataLicenseMonthlyUsd: 0.25,
    });
    expect(p.bandwidth).toMatchObject({
      modeledUploadsGbPer30Days: { min: 60, max: 60 },
      r2DirectEgressUsdPerGb: 0,
      configuredOtherTransferMonthlyUsd: 2,
    });
    expect(project({ bandwidthOverageMonthlyUsd: 4 }).budgetEvaluation.status).toBe('BUDGET_HOLD');
  });

  it('keeps WAL uncompressed when only the legacy Parquet compression input is supplied', () => {
    const p = project({ compressionRatioRange: [4, 5] });
    expect(p.storageBreakdown.wal.retainedGb).toEqual({ min: 1, max: 1 });
    expect(p.storageBreakdown.parquet.retainedGb).toEqual({ min: 0.2, max: 0.25 });
    expect(p.storageBreakdown.combinedMonthlyGb).toEqual({ min: 1.2, max: 1.25 });
    expect(p.stress1xCompression.combinedMonthlyGb).toBe(2);
  });

  it('calculates WAL and Parquet sizes/ratios separately and includes full archive copies', () => {
    const p = project({
      parquetRawSizeMultiplier: 2,
      walCompressionRatioRange: [2, 2],
      parquetCompressionRatioRange: [4, 4],
      additionalArchiveCopies: 1,
      r2StorageOverheadGbMonth: 0.1,
      r2ClassAOperationsPerMonth: 600_000,
      r2ClassBOperationsPerMonth: 500_001,
    });
    expect(p.storageBreakdown.wal.retainedGb).toEqual({ min: 0.5, max: 0.5 });
    expect(p.storageBreakdown.parquet.retainedGb).toEqual({ min: 0.5, max: 0.5 });
    expect(p.storageBreakdown.combinedMonthlyGb.max).toBe(2.1);
    expect(p.r2Billing.billableStorageGbMonth.max).toBe(3);
    expect(p.r2Billing.billableClassAMillions).toBe(2);
    expect(p.r2Billing.billableClassBMillions).toBe(2);
    expect(p.r2Billing.operationsMonthlyUsd).toBe(9.72);
    expect(p.stress1xCompression.combinedMonthlyGb).toBe(6.1);
    expect(p.bandwidth.modeledUploadsGbPer30Days.max).toBe(60);
  });

  it.each([
    [0, 0], [1, 1], [1_000_000, 1], [1_000_001, 2], [2_000_001, 3],
  ])('bills %i requests as %i million for each operation class', (operations, millions) => {
    const p = project({ r2ClassAOperationsPerMonth: operations, r2ClassBOperationsPerMonth: operations });
    expect(p.r2Billing.billableClassAMillions).toBe(millions);
    expect(p.r2Billing.billableClassBMillions).toBe(millions);
  });

  it('does not truncate sub-GB usage before ceiling billing units', () => {
    const p = project({ measuredBytes: 0.1 });
    expect(p.r2Billing.billableStorageGbMonth).toEqual({ min: 1, max: 1 });
    expect(p.r2Billing.storageMonthlyUsd).toEqual({ min: 0.02, max: 0.02 });
    expect(project({ measuredBytes: 0 }).r2Billing.billableStorageGbMonth.max).toBe(0);
    expect(project({ measuredBytes: 1_000_000_001 }).r2Billing.billableStorageGbMonth.max).toBe(3);
  });

  it('compares the $30 ceiling before display rounding, and disallows silently increasing it', () => {
    const p = project({ dataLicenseMonthlyUsd: 1.614 });
    expect(p.knownMonthlyTotalUsdRange).toEqual([30, 30]);
    expect(p.budgetEvaluation.status).toBe('BUDGET_HOLD');
    expect(p.budgetEvaluation.holdReasons).toContain('MINIMUM_KNOWN_COST_EXCEEDS_BUDGET');
    expect(() => project({ monthlyBudgetUsd: 31 })).toThrow(RangeError);
    expect(project({ dataLicenseMonthlyUsd: 1.61 }).budgetEvaluation.status).toBe('WITHIN_BUDGET_KNOWN_COSTS');
  });

  it('holds when the modeled upper range and the 1x compression stress exceed budget', () => {
    const input: Partial<L2CostModelInput> = {
      measuredBytes: 100_000_000_000,
      compressionRatioRange: [10, 10],
      walCompressionRatioRange: [10, 10],
      vpsMonthlyUsdRange: [20, 22],
    };
    const rangeOverrun = project(input);
    expect(rangeOverrun.knownMonthlyTotalUsdRange[0]).toBeLessThanOrEqual(30);
    expect(rangeOverrun.knownMonthlyTotalUsdRange[1]).toBe(30.91);
    expect(rangeOverrun.budgetEvaluation.status).toBe('BUDGET_HOLD');
    expect(rangeOverrun.budgetEvaluation.holdReasons).toContain('MODELED_RANGE_EXCEEDS_BUDGET');

    const stressOnly = project({ ...input, vpsMonthlyUsdRange: [20, 20] });
    expect(stressOnly.knownMonthlyTotalUsdRange[1]).toBe(28.91);
    expect(stressOnly.stress1xCompression.knownMonthlyCeilingUsd).toBe(31.61);
    expect(stressOnly.budgetEvaluation.status).toBe('BUDGET_HOLD');
    expect(stressOnly.budgetEvaluation.holdReasons).toEqual(['COMPRESSION_STRESS_EXCEEDS_BUDGET']);
  });

  it('labels caller-modified prices as MODELED and requires evidence for verified throughput', () => {
    const report = estimateL2CollectionStorageAndCost({ ...knownCosts, r2RateUsdPerGbMonth: 0.015 });
    expect(report.provenance.r2Pricing).toBe('MODELED');
    expect(report.provenance.vpsPricing).toBe('MODELED');
    expect(report.projections[0]!.vps).toMatchObject({ sku: null, capacityAdequacy: 'UNVERIFIED' });
    expect(() => project({ throughputProvenance: 'VERIFIED_INPUT' })).toThrow(/evidence/);
    const verified = estimateL2CollectionStorageAndCost({
      ...knownCosts,
      throughputProvenance: 'VERIFIED_INPUT',
      throughputSourceNote: 'Offline deterministic fixture; not live throughput or capacity evidence.',
    });
    expect(verified.provenance.throughput).toBe('VERIFIED_INPUT');
    expect(verified.provenance.projection).toBe('MODELED');
  });

  it.each([
    { r2RateUsdPerGbMonth: Number.NaN },
    { r2RateUsdPerGbMonth: Number.POSITIVE_INFINITY },
    { r2ClassARateUsdPerMillion: Number.POSITIVE_INFINITY },
    { r2ClassBRateUsdPerMillion: Number.NaN },
    { taxMonthlyUsd: Number.NaN },
    { measuredMarkets: 1.5 },
    { targetMarketTiers: [1.5] },
    { targetMarketTiers: [] },
    { additionalArchiveCopies: -1 },
    { additionalArchiveCopies: 1.5 },
    { r2StorageOverheadGbMonth: -1 },
    { r2ClassAOperationsPerMonth: 0.5 },
    { walCompressionRatioRange: [0, 1] as const },
    { vpsMonthlyUsdRange: [Number.NaN, 24] as const },
    { measuredBytes: Number.MAX_VALUE },
    { throughputSourceNote: ' ' },
  ])('rejects invalid or overflowing boundary inputs %j', (overrides) => {
    expect(() => project(overrides)).toThrow(RangeError);
  });
});
