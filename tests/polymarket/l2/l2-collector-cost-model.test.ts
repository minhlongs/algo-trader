import { describe, expect, it } from 'vitest';
import {
  estimateL2CollectionStorageAndCost,
  type L2CostModelInput,
} from '../../../src/desk/polymarket/l2/l2-collector-cost-model';

const UNVERIFIED_150M_BYTES_PER_MARKET_HOUR = 4_390_000; // 4.39 decimal MB/market-hour (UNVERIFIED planning input)

function buildUnverified150MarketInput(overrides: Partial<L2CostModelInput> = {}): L2CostModelInput {
  return {
    measuredBytes: UNVERIFIED_150M_BYTES_PER_MARKET_HOUR,
    durationSec: 3600,
    measuredMarkets: 1,
    throughputProvenance: 'UNVERIFIED',
    throughputSourceNote: 'Planning assumption 4.39 MB/market-hour; PR #281 lacks raw bytes and market count to reproduce',
    targetMarketTiers: [150],
    retentionDays: 30,
    ...overrides,
  };
}

describe('l2-collector-cost-model conservative regressions', () => {
  it('captures omitted cost items, rounding, 1x stress, and fails closed on unknown mandatory costs', () => {
    const report = estimateL2CollectionStorageAndCost(buildUnverified150MarketInput());

    expect(report.provenance.throughput).toBe('UNVERIFIED');
    expect(report.provenance.compression).toBe('MODELED');
    expect(report.provenance.vpsPricing).toBe('VERIFIED_PUBLIC_LIST_PRICE');
    expect(report.provenance.vpsCapacityAdequacy).toBe('UNVERIFIED');
    expect(report.provenance.r2Pricing).toBe('VERIFIED_PUBLIC_LIST_PRICE');
    expect(report.pricingSources.accessedDate).toBe('2026-11-19');
    expect(report.pricingSources.cloudflareR2.url).toBe('https://developers.cloudflare.com/r2/pricing/');
    expect(report.pricingSources.digitalOceanDroplets.url).toBe('https://www.digitalocean.com/pricing/droplets');

    expect(report.assumptions.freeTierDeducted).toBe(false);
    expect(report.assumptions.retentionDays).toBe(30);
    expect(report.assumptions.targetMarketTiers).toEqual([150]);
    expect(report.assumptions.compressionRatioRange).toEqual([1, 1]);

    const tier = report.projections[0]!;
    expect(tier.targetMarkets).toBe(150);

    // 4.39 MB/market-hour * 150 * 24h * 30d = 474.12 decimal GB for WAL and 474.12 decimal GB for Parquet at 1x default
    expect(tier.storageBreakdown.wal.monthlyUncompressedGb).toBeCloseTo(474.12, 3);
    expect(tier.storageBreakdown.parquet.monthlyUncompressedGb).toBeCloseTo(474.12, 3);
    expect(tier.storageBreakdown.combinedMonthlyGb.min).toBeCloseTo(948.24, 3);
    expect(tier.storageBreakdown.combinedMonthlyGb.max).toBeCloseTo(948.24, 3);

    // Whole-GB ceil rounding: ceil(948.24) = 949 GB-month * $0.015 = $14.235 -> $14.24
    expect(tier.r2Billing.billableStorageGbMonth.min).toBe(949);
    expect(tier.r2Billing.billableStorageGbMonth.max).toBe(949);
    expect(tier.r2Billing.freeTierDeducted).toBe(false);

    // Per-million operation ceil rounding: default 4,320 A -> 1M ($4.50) + 8,640 B -> 1M ($0.36) = $4.86
    expect(tier.r2Billing.classAOperations).toBe(4320);
    expect(tier.r2Billing.classBOperations).toBe(8640);
    expect(tier.r2Billing.billableClassAMillions).toBe(1);
    expect(tier.r2Billing.billableClassBMillions).toBe(1);
    expect(tier.r2Billing.operationsMonthlyUsd).toBe(4.86);

    // Default VPS uses verified DO s-2vcpu-4gb list price ($24), capacity UNVERIFIED
    expect(tier.vps.monthlyUsdRange).toEqual([24, 24]);
    expect(tier.vps.pricingStatus).toBe('VERIFIED_PUBLIC_LIST_PRICE');
    expect(tier.vps.capacityAdequacy).toBe('UNVERIFIED');

    // Mandatory unknown costs (tax, licensing, bandwidth overage) default to null and block budget approval
    expect(tier.nonStorageCosts.taxMonthlyUsd).toBeNull();
    expect(tier.nonStorageCosts.dataLicenseMonthlyUsd).toBeNull();
    expect(tier.nonStorageCosts.bandwidthOverageMonthlyUsd).toBeNull();
    expect(tier.budgetEvaluation.monthlyBudgetUsd).toBe(30);
    expect(tier.budgetEvaluation.status).toBe('BUDGET_HOLD');
    expect(tier.budgetEvaluation.holdReasons).toContain('MINIMUM_KNOWN_COST_EXCEEDS_BUDGET');
    expect(tier.budgetEvaluation.holdReasons).toContain('UNKNOWN_MANDATORY_COSTS');
    expect(tier.budgetEvaluation.unknownMandatoryCostItems).toEqual(
      expect.arrayContaining(['taxMonthlyUsd', 'dataLicenseMonthlyUsd', 'bandwidthOverageMonthlyUsd']),
    );
    expect(tier.budgetEvaluation.isUpperBoundGuaranteed).toBe(false);

    // 1x compression stress is always reported separately even if caller sets optimistic compression
    expect(tier.stress1xCompression.combinedMonthlyGb).toBeCloseTo(948.24, 3);
    expect(tier.stress1xCompression.billableStorageGbMonth).toBe(949);
    expect(tier.stress1xCompression.knownMonthlyFloorUsd).toBeGreaterThan(30);
  });

  it('reproduces the 150-market 30d Bear ($31.06), Base ($33.93), and High Stress ($59.32) plan scenarios exactly', () => {
    const scenarios = [
      {
        name: 'Bear (0.5x traffic, 6x compression, $1 reserve)',
        trafficMultiplier: 0.5,
        compression: [6, 6] as const,
        reserveUsd: 1,
        expectedGb: 79.02,
        expectedBilledGb: 80,
        expectedR2StorageUsd: 1.2,
        expectedTotalUsd: 31.06,
      },
      {
        name: 'Base (1x traffic, 3.5x compression, $1 reserve)',
        trafficMultiplier: 1,
        compression: [3.5, 3.5] as const,
        reserveUsd: 1,
        expectedGb: 270.926,
        expectedBilledGb: 271,
        expectedR2StorageUsd: 4.07,
        expectedTotalUsd: 33.93,
      },
      {
        name: 'High Stress (2x traffic, 1x compression, $2 reserve)',
        trafficMultiplier: 2,
        compression: [1, 1] as const,
        reserveUsd: 2,
        expectedGb: 1896.48,
        expectedBilledGb: 1897,
        expectedR2StorageUsd: 28.46,
        expectedTotalUsd: 59.32,
      },
    ];

    for (const s of scenarios) {
      const report = estimateL2CollectionStorageAndCost(
        buildUnverified150MarketInput({
          measuredBytes: UNVERIFIED_150M_BYTES_PER_MARKET_HOUR * s.trafficMultiplier,
          compressionRatioRange: s.compression,
          walCompressionRatioRange: s.compression,
          parquetCompressionRatioRange: s.compression,
          backupAndMonitoringReserveMonthlyUsd: s.reserveUsd,
          bandwidthOverageMonthlyUsd: 0,
          taxMonthlyUsd: null,
          dataLicenseMonthlyUsd: null,
        }),
      );
      const tier = report.projections[0]!;
      expect(tier.storageBreakdown.combinedMonthlyGb.max, s.name).toBeCloseTo(s.expectedGb, 3);
      expect(tier.r2Billing.billableStorageGbMonth.max, s.name).toBe(s.expectedBilledGb);
      expect(tier.r2Billing.storageMonthlyUsd.max, s.name).toBe(s.expectedR2StorageUsd);
      expect(tier.r2Billing.operationsMonthlyUsd, s.name).toBe(4.86);
      expect(tier.knownMonthlyTotalUsdRange[0], s.name).toBe(s.expectedTotalUsd);
      expect(tier.knownMonthlyTotalUsdRange[1], s.name).toBe(s.expectedTotalUsd);
      expect(tier.budgetEvaluation.status, s.name).toBe('BUDGET_HOLD');
      expect(tier.budgetEvaluation.holdReasons, s.name).toContain('MINIMUM_KNOWN_COST_EXCEEDS_BUDGET');
      expect(tier.budgetEvaluation.holdReasons, s.name).toContain('UNKNOWN_MANDATORY_COSTS');
      // Never silently reduces market count or retention to pass budget
      expect(tier.targetMarkets, s.name).toBe(150);
      expect(report.assumptions.retentionDays, s.name).toBe(30);
    }
  });

  it('rounds R2 storage up to whole GB-months and Class A/B operations up per million independently', () => {
    // 1.1 GB combined -> 2 GB-month billed; 1,000,001 Class A -> 2M ($9.00); 1 Class B -> 1M ($0.36)
    const bytesFor0_55GbPer30d = 550_000_000 / (24 * 30);
    const report = estimateL2CollectionStorageAndCost({
      measuredBytes: bytesFor0_55GbPer30d,
      durationSec: 3600,
      measuredMarkets: 1,
      targetMarketTiers: [1],
      retentionDays: 30,
      compressionRatioRange: [1, 1],
      parquetCompressionRatioRange: [1, 1],
      r2ClassAOperationsPerMonth: 1_000_001,
      r2ClassBOperationsPerMonth: 1,
      vpsMonthlyUsdRange: [6, 6],
      vpsPricingStatus: 'MODELED',
      backupAndMonitoringReserveMonthlyUsd: 0,
      bandwidthOverageMonthlyUsd: 0,
      taxMonthlyUsd: 0,
      dataLicenseMonthlyUsd: 0,
    });

    const tier = report.projections[0]!;
    expect(tier.storageBreakdown.combinedMonthlyGb.max).toBeCloseTo(1.1, 3);
    expect(tier.r2Billing.billableStorageGbMonth.max).toBe(2);
    expect(tier.r2Billing.storageMonthlyUsd.max).toBe(0.03);
    expect(tier.r2Billing.billableClassAMillions).toBe(2);
    expect(tier.r2Billing.billableClassBMillions).toBe(1);
    expect(tier.r2Billing.operationsMonthlyUsd).toBe(9.36);
    expect(tier.knownMonthlyTotalUsdRange).toEqual([15.39, 15.39]);
    expect(tier.budgetEvaluation.status).toBe('WITHIN_BUDGET_KNOWN_COSTS');
  });

  it('fails closed with BUDGET_HOLD when known costs are under $30 but tax or licensing is unknown', () => {
    const report = estimateL2CollectionStorageAndCost({
      measuredBytes: 100_000,
      durationSec: 3600,
      measuredMarkets: 10,
      targetMarketTiers: [50],
      vpsMonthlyUsdRange: [12, 12],
      vpsPricingStatus: 'MODELED',
      backupAndMonitoringReserveMonthlyUsd: 1,
      bandwidthOverageMonthlyUsd: 0,
      taxMonthlyUsd: null,
      dataLicenseMonthlyUsd: 0,
    });

    const tier = report.projections[0]!;
    expect(tier.knownMonthlyTotalUsdRange[0]).toBeLessThan(30);
    expect(tier.budgetEvaluation.status).toBe('BUDGET_HOLD');
    expect(tier.budgetEvaluation.holdReasons).toEqual(['UNKNOWN_MANDATORY_COSTS']);
    expect(tier.budgetEvaluation.unknownMandatoryCostItems).toEqual(['taxMonthlyUsd']);
  });

  it('always computes 1x compression stress even when caller passes optimistic compression ratios', () => {
    const report = estimateL2CollectionStorageAndCost(
      buildUnverified150MarketInput({
        compressionRatioRange: [3.5, 6],
        walCompressionRatioRange: [3.5, 6],
        parquetCompressionRatioRange: [3.5, 6],
        backupAndMonitoringReserveMonthlyUsd: 1,
        bandwidthOverageMonthlyUsd: 0,
        taxMonthlyUsd: 0,
        dataLicenseMonthlyUsd: 0,
      }),
    );

    const tier = report.projections[0]!;
    expect(tier.storageBreakdown.combinedMonthlyGb.min).toBeCloseTo(158.04, 2);
    expect(tier.storageBreakdown.combinedMonthlyGb.max).toBeCloseTo(270.926, 3);
    expect(tier.stress1xCompression.combinedMonthlyGb).toBeCloseTo(948.24, 3);
    expect(tier.stress1xCompression.billableStorageGbMonth).toBe(949);
    expect(tier.stress1xCompression.r2StorageMonthlyUsd).toBe(14.24);
    expect(tier.stress1xCompression.knownMonthlyFloorUsd).toBe(44.1);
  });

  it('validates boundary inputs for prices, operations, retention, backup, bandwidth, tax, and VPS ranges', () => {
    const base: L2CostModelInput = {
      measuredBytes: 1000,
      durationSec: 3600,
      measuredMarkets: 1,
    };

    expect(() => estimateL2CollectionStorageAndCost({ ...base, retentionDays: 0 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, r2ClassARateUsdPerMillion: -1 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, r2ClassBRateUsdPerMillion: -0.1 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, r2ClassAOperationsPerMonth: -1 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, r2ClassBOperationsPerMonth: Number.NaN })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, vpsMonthlyUsdRange: [24, 12] })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, vpsMonthlyUsdRange: [-1, 10] })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, backupAndMonitoringReserveMonthlyUsd: -1 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, bandwidthOverageMonthlyUsd: -0.5 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, taxMonthlyUsd: -1 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, dataLicenseMonthlyUsd: -5 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, monthlyBudgetUsd: 0 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, parquetRawSizeMultiplier: 0 })).toThrow(RangeError);
    expect(() => estimateL2CollectionStorageAndCost({ ...base, parquetCompressionRatioRange: [5, 2] })).toThrow(RangeError);
  });
});
