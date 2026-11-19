/**
 * Empirically parameterized storage, bandwidth, and ops cost model for
 * continuous read-only Polymarket L2 orderbook collection.
 */

export interface L2CostModelInput {
  measuredBytes: number;
  durationSec: number;
  measuredMarkets: number;
  targetMarketTiers?: readonly number[];
  compressionRatioRange?: readonly [number, number];
  r2RateUsdPerGbMonth?: number;
}

export interface L2MarketTierProjection {
  targetMarkets: number;
  bytesPerMarketHour: number;
  rawWalGbPerDay: number;
  zstdParquetGbPerDay: {
    min: number;
    max: number;
    compressionRatioRange: [number, number];
  };
  monthlyStorageGb: {
    rawWal: number;
    zstdParquetMin: number;
    zstdParquetMax: number;
  };
  r2StorageMonthlyUsd: {
    min: number;
    max: number;
  };
  vpsMonthlyUsdRange: [number, number];
  totalMonthlyUsdRange: [number, number];
}

export interface L2CostModelReport {
  measuredBytes: number;
  durationSec: number;
  measuredMarkets: number;
  bytesPerMarketHour: number;
  compressionRatioRange: [number, number];
  r2RateUsdPerGbMonth: number;
  projections: L2MarketTierProjection[];
}

const DEFAULT_TIERS: readonly number[] = [50, 150, 300];
const DEFAULT_COMPRESSION_RANGE: [number, number] = [3.5, 6.0];
const DEFAULT_R2_RATE_USD_PER_GB_MONTH = 0.015; // Cloudflare R2 Standard (zero egress)
const BYTES_PER_DECIMAL_GB = 1_000_000_000;
const DAYS_PER_MONTH = 30;

function round(val: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function vpsMonthlyRangeForMarkets(targetMarkets: number): [number, number] {
  if (targetMarkets <= 75) return [6, 12];
  if (targetMarkets <= 200) return [12, 24];
  return [20, 40];
}

export function estimateL2CollectionStorageAndCost(input: L2CostModelInput): L2CostModelReport {
  const { measuredBytes, durationSec, measuredMarkets } = input;
  if (!Number.isFinite(measuredBytes) || measuredBytes < 0) {
    throw new RangeError(`measuredBytes must be a non-negative finite number, got ${measuredBytes}`);
  }
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new RangeError(`durationSec must be a positive finite number, got ${durationSec}`);
  }
  if (!Number.isFinite(measuredMarkets) || measuredMarkets <= 0) {
    throw new RangeError(`measuredMarkets must be a positive finite number, got ${measuredMarkets}`);
  }

  const ratioTuple = input.compressionRatioRange ?? DEFAULT_COMPRESSION_RANGE;
  const minRatio = ratioTuple[0];
  const maxRatio = ratioTuple[1];
  if (!Number.isFinite(minRatio) || !Number.isFinite(maxRatio) || minRatio <= 0 || maxRatio < minRatio) {
    throw new RangeError(`Invalid compressionRatioRange: [${minRatio}, ${maxRatio}]`);
  }

  const r2Rate = input.r2RateUsdPerGbMonth ?? DEFAULT_R2_RATE_USD_PER_GB_MONTH;
  if (!Number.isFinite(r2Rate) || r2Rate < 0) {
    throw new RangeError(`r2RateUsdPerGbMonth must be non-negative, got ${r2Rate}`);
  }

  const tiers = input.targetMarketTiers?.length ? [...input.targetMarketTiers] : [...DEFAULT_TIERS];
  const hours = durationSec / 3600;
  const bytesPerMarketHour = measuredBytes / (measuredMarkets * hours);

  const projections: L2MarketTierProjection[] = tiers.map((targetMarkets) => {
    if (!Number.isFinite(targetMarkets) || targetMarkets <= 0) {
      throw new RangeError(`targetMarkets must be positive, got ${targetMarkets}`);
    }
    const rawWalGbPerDay = (bytesPerMarketHour * targetMarkets * 24) / BYTES_PER_DECIMAL_GB;
    const zstdMinGbPerDay = rawWalGbPerDay / maxRatio;
    const zstdMaxGbPerDay = rawWalGbPerDay / minRatio;

    const monthlyRawWalGb = rawWalGbPerDay * DAYS_PER_MONTH;
    const monthlyZstdMinGb = zstdMinGbPerDay * DAYS_PER_MONTH;
    const monthlyZstdMaxGb = zstdMaxGbPerDay * DAYS_PER_MONTH;

    const r2MinUsd = monthlyZstdMinGb * r2Rate;
    const r2MaxUsd = monthlyZstdMaxGb * r2Rate;
    const vpsRange = vpsMonthlyRangeForMarkets(targetMarkets);

    return {
      targetMarkets,
      bytesPerMarketHour: round(bytesPerMarketHour, 2),
      rawWalGbPerDay: round(rawWalGbPerDay, 4),
      zstdParquetGbPerDay: {
        min: round(zstdMinGbPerDay, 4),
        max: round(zstdMaxGbPerDay, 4),
        compressionRatioRange: [minRatio, maxRatio],
      },
      monthlyStorageGb: {
        rawWal: round(monthlyRawWalGb, 3),
        zstdParquetMin: round(monthlyZstdMinGb, 3),
        zstdParquetMax: round(monthlyZstdMaxGb, 3),
      },
      r2StorageMonthlyUsd: {
        min: round(r2MinUsd, 2),
        max: round(r2MaxUsd, 2),
      },
      vpsMonthlyUsdRange: vpsRange,
      totalMonthlyUsdRange: [round(vpsRange[0] + r2MinUsd, 2), round(vpsRange[1] + r2MaxUsd, 2)],
    };
  });

  return {
    measuredBytes,
    durationSec,
    measuredMarkets,
    bytesPerMarketHour: round(bytesPerMarketHour, 2),
    compressionRatioRange: [minRatio, maxRatio],
    r2RateUsdPerGbMonth: r2Rate,
    projections,
  };
}
