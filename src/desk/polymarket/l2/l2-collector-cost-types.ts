/** Public cost-report contracts; a projection is never provisioning authorization. */
export type L2PricingStatus = 'MODELED' | 'VERIFIED_PUBLIC_LIST_PRICE';
export type L2NumberRange = { min: number; max: number };
export type L2RatioRange = readonly [number, number];

export interface L2MandatoryCosts {
  /** Monitoring/config-backup allowance, not a full duplicate archive. */
  backupAndMonitoringReserveMonthlyUsd: number | null;
  /** Includes VPS transfer overage, restores/retries, and connected-service fees. */
  bandwidthOverageMonthlyUsd: number | null;
  taxMonthlyUsd: number | null;
  dataLicenseMonthlyUsd: number | null;
}

export interface L2CostModelInput extends Partial<L2MandatoryCosts> {
  /** Legacy name: supplying this number does not verify measured throughput. */
  measuredBytes: number;
  durationSec: number;
  measuredMarkets: number;
  targetMarketTiers?: readonly number[];
  compressionRatioRange?: L2RatioRange;
  walCompressionRatioRange?: L2RatioRange;
  parquetCompressionRatioRange?: L2RatioRange;
  /** Independent Parquet raw-equivalent size allowance; not a codec measurement. */
  parquetRawSizeMultiplier?: number;
  retentionDays?: number;
  additionalArchiveCopies?: number;
  r2StorageOverheadGbMonth?: number;
  r2RateUsdPerGbMonth?: number;
  r2ClassARateUsdPerMillion?: number;
  r2ClassBRateUsdPerMillion?: number;
  r2ClassAOperationsPerMonth?: number;
  r2ClassBOperationsPerMonth?: number;
  vpsMonthlyUsdRange?: L2RatioRange;
  /** Overrides are modeled, never promoted to a verified public quote. */
  vpsPricingStatus?: 'MODELED';
  vpsSourceNote?: string;
  throughputProvenance?: 'UNVERIFIED' | 'VERIFIED_INPUT';
  throughputSourceNote?: string;
  /** May tighten, but cannot raise the authorized $30 ceiling. */
  monthlyBudgetUsd?: number;
}

export interface L2CostAssumptions extends L2MandatoryCosts {
  targetMarketTiers: number[];
  compressionRatioRange: [number, number];
  walCompressionRatioRange: [number, number];
  parquetCompressionRatioRange: [number, number];
  retentionDays: number;
  billingPeriodDays: 30;
  storageGbUnitBytes: 1000000000;
  storageBasis: 'STEADY_STATE_ROLLING_RETENTION';
  parquetRawSizeMultiplier: number;
  additionalArchiveCopies: number;
  r2StorageOverheadGbMonth: number;
  r2RateUsdPerGbMonth: number;
  r2ClassARateUsdPerMillion: number;
  r2ClassBRateUsdPerMillion: number;
  r2ClassAOperationsPerMonth: number;
  r2ClassBOperationsPerMonth: number;
  operationsBasis: string;
  vpsMonthlyUsdRange: [number, number];
  vpsSourceNote: string;
  monthlyBudgetUsd: number;
  freeTierDeducted: false;
}

export interface L2ArtifactStorageProjection {
  monthlyUncompressedGb: number;
  retainedGb: L2NumberRange;
  compressionRatioRange: [number, number];
}

export interface L2R2Billing {
  billableStorageGbMonth: L2NumberRange;
  storageMonthlyUsd: L2NumberRange;
  classAOperations: number;
  classBOperations: number;
  billableClassAMillions: number;
  billableClassBMillions: number;
  operationsMonthlyUsd: number;
  freeTierDeducted: false;
}

export type L2BudgetHoldReason = 'MINIMUM_KNOWN_COST_EXCEEDS_BUDGET' | 'UNKNOWN_MANDATORY_COSTS'
  | 'MODELED_RANGE_EXCEEDS_BUDGET' | 'COMPRESSION_STRESS_EXCEEDS_BUDGET';

export interface L2MarketTierProjection {
  targetMarkets: number;
  bytesPerMarketHour: number;
  rawWalGbPerDay: number;
  zstdParquetGbPerDay: L2NumberRange & { compressionRatioRange: [number, number] };
  monthlyStorageGb: { rawWal: number; zstdParquetMin: number; zstdParquetMax: number };
  /** WAL + Parquet + explicitly selected archive copies/overhead, rounded billing units. */
  r2StorageMonthlyUsd: L2NumberRange;
  vpsMonthlyUsdRange: [number, number];
  /** Compatibility alias for knownMonthlyTotalUsdRange; NOT an all-in upper bound. */
  totalMonthlyUsdRange: [number, number];
  knownMonthlyTotalUsdRange: [number, number];
  storageBreakdown: {
    wal: L2ArtifactStorageProjection;
    parquet: L2ArtifactStorageProjection;
    combinedMonthlyGb: L2NumberRange;
    additionalArchiveCopies: number;
    overheadGbMonth: number;
  };
  r2Billing: L2R2Billing;
  vps: {
    monthlyUsdRange: [number, number];
    pricingStatus: L2PricingStatus;
    sourceNote: string;
    sku: string | null;
    capacityAdequacy: 'UNVERIFIED';
    includedOutboundTransferGiB: number | null;
  };
  bandwidth: {
    modeledUploadsGbPer30Days: L2NumberRange;
    r2DirectEgressUsdPerGb: 0;
    configuredOtherTransferMonthlyUsd: number | null;
    restoresRetriesAndConnectedServicesMustBeIncluded: true;
  };
  nonStorageCosts: L2MandatoryCosts;
  stress1xCompression: {
    combinedMonthlyGb: number;
    billableStorageGbMonth: number;
    r2StorageMonthlyUsd: number;
    knownMonthlyFloorUsd: number;
    knownMonthlyCeilingUsd: number;
  };
  budgetEvaluation: {
    monthlyBudgetUsd: number;
    status: 'BUDGET_HOLD' | 'WITHIN_BUDGET_KNOWN_COSTS';
    holdReasons: L2BudgetHoldReason[];
    unknownMandatoryCostItems: (keyof L2MandatoryCosts)[];
    isUpperBoundGuaranteed: false;
    provisioningAuthorized: false;
  };
}

export interface L2CostModelReport {
  measuredBytes: number;
  durationSec: number;
  measuredMarkets: number;
  bytesPerMarketHour: number;
  compressionRatioRange: [number, number];
  r2RateUsdPerGbMonth: number;
  inputs: L2CostModelInput;
  assumptions: L2CostAssumptions;
  provenance: {
    projection: 'MODELED';
    throughput: 'UNVERIFIED' | 'VERIFIED_INPUT';
    throughputSourceNote: string;
    compression: 'MODELED';
    parquetSize: 'MODELED';
    vpsPricing: L2PricingStatus;
    vpsCapacityAdequacy: 'UNVERIFIED';
    r2Pricing: L2PricingStatus;
    nonStorageCosts: 'CALLER_ESTIMATES_OR_UNKNOWN';
  };
  pricingSources: {
    accessedDate: '2026-11-19';
    cloudflareR2: { url: string; scope: string };
    digitalOceanDroplets: { url: string; scope: string };
  };
  limitations: string[];
  projections: L2MarketTierProjection[];
}
