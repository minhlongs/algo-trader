import { roundCost } from './l2-collector-cost-assumptions';
import { billL2R2Usage, evaluateL2Budget, knownL2TotalUsd } from './l2-collector-cost-billing';
import type { L2CostAssumptions, L2MarketTierProjection, L2NumberRange, L2PricingStatus } from './l2-collector-cost-types';

function artifactSize(rawRetainedGb: number, ratios: [number, number]): L2NumberRange {
  return { min: rawRetainedGb / ratios[1], max: rawRetainedGb / ratios[0] };
}

function displayedSize(value: L2NumberRange): L2NumberRange {
  return { min: roundCost(value.min, 3), max: roundCost(value.max, 3) };
}

export function projectL2MarketTier(
  a: L2CostAssumptions, targetMarkets: number, bytesPerMarketHour: number, vpsStatus: L2PricingStatus,
): L2MarketTierProjection {
  const rawWalGbPerDay = bytesPerMarketHour * targetMarkets * 24 / a.storageGbUnitBytes;
  const rawParquetGbPerDay = rawWalGbPerDay * a.parquetRawSizeMultiplier;
  const rawWalRetainedGb = rawWalGbPerDay * a.retentionDays;
  const rawParquetRetainedGb = rawParquetGbPerDay * a.retentionDays;
  const wal = artifactSize(rawWalRetainedGb, a.walCompressionRatioRange);
  const parquet = artifactSize(rawParquetRetainedGb, a.parquetCompressionRatioRange);
  const copies = 1 + a.additionalArchiveCopies;
  const combined = {
    min: (wal.min + parquet.min) * copies + a.r2StorageOverheadGbMonth,
    max: (wal.max + parquet.max) * copies + a.r2StorageOverheadGbMonth,
  };
  const billing = billL2R2Usage(a, combined);
  const min = knownL2TotalUsd(a, billing, 'min');
  const max = knownL2TotalUsd(a, billing, 'max');
  const displayedTotals: [number, number] = [roundCost(min, 2), roundCost(max, 2)];
  const stressGb = (rawWalRetainedGb + rawParquetRetainedGb) * copies + a.r2StorageOverheadGbMonth;
  const stressBilling = billL2R2Usage(a, { min: stressGb, max: stressGb });
  const stressMin = knownL2TotalUsd(a, stressBilling, 'min');
  const stressMax = knownL2TotalUsd(a, stressBilling, 'max');
  const monthlyUploadFactor = a.billingPeriodDays / a.retentionDays * copies;
  return {
    targetMarkets,
    bytesPerMarketHour: roundCost(bytesPerMarketHour, 2),
    rawWalGbPerDay: roundCost(rawWalGbPerDay, 4),
    zstdParquetGbPerDay: {
      min: roundCost(rawParquetGbPerDay / a.parquetCompressionRatioRange[1], 4),
      max: roundCost(rawParquetGbPerDay / a.parquetCompressionRatioRange[0], 4),
      compressionRatioRange: [...a.parquetCompressionRatioRange],
    },
    monthlyStorageGb: {
      rawWal: roundCost(rawWalRetainedGb, 3),
      zstdParquetMin: roundCost(parquet.min, 3),
      zstdParquetMax: roundCost(parquet.max, 3),
    },
    r2StorageMonthlyUsd: { ...billing.storageMonthlyUsd },
    vpsMonthlyUsdRange: [...a.vpsMonthlyUsdRange],
    totalMonthlyUsdRange: [...displayedTotals],
    knownMonthlyTotalUsdRange: displayedTotals,
    storageBreakdown: {
      wal: {
        monthlyUncompressedGb: roundCost(rawWalRetainedGb, 3),
        retainedGb: displayedSize(wal),
        compressionRatioRange: [...a.walCompressionRatioRange],
      },
      parquet: {
        monthlyUncompressedGb: roundCost(rawParquetRetainedGb, 3),
        retainedGb: displayedSize(parquet),
        compressionRatioRange: [...a.parquetCompressionRatioRange],
      },
      combinedMonthlyGb: displayedSize(combined),
      additionalArchiveCopies: a.additionalArchiveCopies,
      overheadGbMonth: a.r2StorageOverheadGbMonth,
    },
    r2Billing: billing,
    vps: {
      monthlyUsdRange: [...a.vpsMonthlyUsdRange],
      pricingStatus: vpsStatus,
      sourceNote: a.vpsSourceNote,
      sku: vpsStatus === 'VERIFIED_PUBLIC_LIST_PRICE' ? 's-2vcpu-4gb' : null,
      capacityAdequacy: 'UNVERIFIED',
      includedOutboundTransferGiB: vpsStatus === 'VERIFIED_PUBLIC_LIST_PRICE' ? 4000 : null,
    },
    bandwidth: {
      modeledUploadsGbPer30Days: displayedSize({
        min: (wal.min + parquet.min) * monthlyUploadFactor,
        max: (wal.max + parquet.max) * monthlyUploadFactor,
      }),
      r2DirectEgressUsdPerGb: 0,
      configuredOtherTransferMonthlyUsd: a.bandwidthOverageMonthlyUsd,
      restoresRetriesAndConnectedServicesMustBeIncluded: true,
    },
    nonStorageCosts: {
      backupAndMonitoringReserveMonthlyUsd: a.backupAndMonitoringReserveMonthlyUsd,
      bandwidthOverageMonthlyUsd: a.bandwidthOverageMonthlyUsd,
      taxMonthlyUsd: a.taxMonthlyUsd,
      dataLicenseMonthlyUsd: a.dataLicenseMonthlyUsd,
    },
    stress1xCompression: {
      combinedMonthlyGb: roundCost(stressGb, 3),
      billableStorageGbMonth: stressBilling.billableStorageGbMonth.min,
      r2StorageMonthlyUsd: stressBilling.storageMonthlyUsd.min,
      knownMonthlyFloorUsd: roundCost(stressMin, 2),
      knownMonthlyCeilingUsd: roundCost(stressMax, 2),
    },
    budgetEvaluation: evaluateL2Budget(a, min, max, stressMax),
  };
}
