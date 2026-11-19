import type { L2CostAssumptions, L2CostModelInput, L2MandatoryCosts, L2PricingStatus } from './l2-collector-cost-types';

/** Public prices checked 2026-11-19; not an account/region quote or capacity proof. */
export const L2_COST_PRICING_SOURCES = {
  accessedDate: '2026-11-19',
  cloudflareR2: {
    url: 'https://developers.cloudflare.com/r2/pricing/',
    scope: 'Standard: $0.015/GB-month, $4.50/million Class A, $0.36/million Class B; ceil each unit; direct egress $0.',
  },
  digitalOceanDroplets: {
    url: 'https://www.digitalocean.com/pricing/droplets',
    scope: 'Basic regular s-2vcpu-4gb: $24/month, 2 vCPU, 4 GiB RAM, 80 GiB SSD, 4,000 GiB outbound; tax excluded.',
  },
} as const;

export const MANDATORY_COST_KEYS = [
  'backupAndMonitoringReserveMonthlyUsd', 'bandwidthOverageMonthlyUsd', 'taxMonthlyUsd', 'dataLicenseMonthlyUsd',
] as const satisfies readonly (keyof L2MandatoryCosts)[];

export function costNumber(name: string, value: number, minimum = 0, integer = false): number {
  if (!Number.isFinite(value) || value < minimum || (integer && !Number.isSafeInteger(value))) {
    throw new RangeError(`${name} must be finite, >= ${minimum}${integer ? ', and a safe integer' : ''}`);
  }
  return value;
}

function positiveNumber(name: string, value: number): number {
  costNumber(name, value);
  if (value === 0) throw new RangeError(`${name} must be positive`);
  return value;
}

function range(name: string, value: readonly [number, number], minimum: number): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new RangeError(`${name} must contain exactly two numbers`);
  const low = costNumber(`${name}[0]`, value[0], minimum);
  const high = costNumber(`${name}[1]`, value[1], minimum);
  if (high < low) throw new RangeError(`${name} must be ordered low to high`);
  return [low, high];
}

function sourceNote(name: string, value: string | undefined): void {
  if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
    throw new RangeError(`${name} must be non-empty text`);
  }
}

export function resolveL2CostAssumptions(input: L2CostModelInput): L2CostAssumptions {
  costNumber('measuredBytes', input.measuredBytes);
  positiveNumber('durationSec', input.durationSec);
  costNumber('measuredMarkets', input.measuredMarkets, 1, true);
  const targetMarketTiers = [...(input.targetMarketTiers ?? [50, 150, 300])];
  if (!targetMarketTiers.length) throw new RangeError('targetMarketTiers cannot be empty');
  targetMarketTiers.forEach((tier) => costNumber('targetMarkets', tier, 1, true));
  if (input.throughputProvenance !== undefined && !['UNVERIFIED', 'VERIFIED_INPUT'].includes(input.throughputProvenance)) {
    throw new RangeError('Invalid throughputProvenance');
  }
  sourceNote('throughputSourceNote', input.throughputSourceNote);
  sourceNote('vpsSourceNote', input.vpsSourceNote);
  if (input.throughputProvenance === 'VERIFIED_INPUT' && !input.throughputSourceNote?.trim()) {
    throw new RangeError('VERIFIED_INPUT throughput requires throughputSourceNote evidence');
  }
  if (input.vpsPricingStatus !== undefined && input.vpsPricingStatus !== 'MODELED') {
    throw new RangeError('Caller VPS price overrides must be MODELED');
  }
  const costs: L2MandatoryCosts = {
    backupAndMonitoringReserveMonthlyUsd: input.backupAndMonitoringReserveMonthlyUsd ?? null,
    bandwidthOverageMonthlyUsd: input.bandwidthOverageMonthlyUsd ?? null,
    taxMonthlyUsd: input.taxMonthlyUsd ?? null,
    dataLicenseMonthlyUsd: input.dataLicenseMonthlyUsd ?? null,
  };
  for (const key of MANDATORY_COST_KEYS) {
    if (costs[key] !== null) costNumber(key, costs[key]);
  }
  const monthlyBudgetUsd = positiveNumber('monthlyBudgetUsd', input.monthlyBudgetUsd ?? 30);
  if (monthlyBudgetUsd > 30) throw new RangeError('monthlyBudgetUsd cannot exceed the authorized $30 ceiling');
  const legacyCompression = range('compressionRatioRange', input.compressionRatioRange ?? [1, 1], 1);
  const parquetCompressionRatioRange = range('parquetCompressionRatioRange', input.parquetCompressionRatioRange ?? legacyCompression, 1);
  const walCompressionRatioRange = range('walCompressionRatioRange', input.walCompressionRatioRange ?? [1, 1], 1);
  const hasCustomVps = input.vpsMonthlyUsdRange !== undefined;
  return {
    ...costs,
    targetMarketTiers,
    compressionRatioRange: legacyCompression,
    walCompressionRatioRange,
    parquetCompressionRatioRange,
    retentionDays: positiveNumber('retentionDays', input.retentionDays ?? 30),
    billingPeriodDays: 30,
    storageGbUnitBytes: 1_000_000_000,
    storageBasis: 'STEADY_STATE_ROLLING_RETENTION',
    parquetRawSizeMultiplier: positiveNumber('parquetRawSizeMultiplier', input.parquetRawSizeMultiplier ?? 1),
    additionalArchiveCopies: costNumber('additionalArchiveCopies', input.additionalArchiveCopies ?? 0, 0, true),
    r2StorageOverheadGbMonth: costNumber('r2StorageOverheadGbMonth', input.r2StorageOverheadGbMonth ?? 0),
    r2RateUsdPerGbMonth: costNumber('r2RateUsdPerGbMonth', input.r2RateUsdPerGbMonth ?? 0.015),
    r2ClassARateUsdPerMillion: costNumber('r2ClassARateUsdPerMillion', input.r2ClassARateUsdPerMillion ?? 4.5),
    r2ClassBRateUsdPerMillion: costNumber('r2ClassBRateUsdPerMillion', input.r2ClassBRateUsdPerMillion ?? 0.36),
    r2ClassAOperationsPerMonth: costNumber('r2ClassAOperationsPerMonth', input.r2ClassAOperationsPerMonth ?? 4320, 0, true),
    r2ClassBOperationsPerMonth: costNumber('r2ClassBOperationsPerMonth', input.r2ClassBOperationsPerMonth ?? 8640, 0, true),
    operationsBasis: 'MODELED per 30d: 720h * (WAL + Parquet + manifest) * 2 A / 4 B = 4320 A / 8640 B; overrides explicit; extra copies multiply both.',
    vpsMonthlyUsdRange: range('vpsMonthlyUsdRange', input.vpsMonthlyUsdRange ?? [24, 24], 0),
    vpsSourceNote: input.vpsSourceNote ?? (hasCustomVps ? 'Caller-modeled price; SKU, capacity, region and quote unverified.' : L2_COST_PRICING_SOURCES.digitalOceanDroplets.scope),
    monthlyBudgetUsd,
    freeTierDeducted: false,
  };
}

export function r2PricingStatus(input: L2CostModelInput): L2PricingStatus {
  return input.r2RateUsdPerGbMonth === undefined && input.r2ClassARateUsdPerMillion === undefined
    && input.r2ClassBRateUsdPerMillion === undefined ? 'VERIFIED_PUBLIC_LIST_PRICE' : 'MODELED';
}

export function vpsPricingStatus(input: L2CostModelInput): L2PricingStatus {
  return input.vpsMonthlyUsdRange === undefined && input.vpsPricingStatus === undefined ? 'VERIFIED_PUBLIC_LIST_PRICE' : 'MODELED';
}

export function roundCost(value: number, decimals = 4): number {
  costNumber('calculated cost/usage', value);
  const factor = 10 ** decimals;
  // Round decimal ties consistently; never round usage before provider billing-unit ceilings.
  const rounded = Math.round((value + Number.EPSILON * Math.max(1, value)) * factor) / factor;
  return costNumber('rounded cost/usage', rounded);
}
