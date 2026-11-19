/**
 * Conservative, boundary-validated storage, bandwidth, and ops cost model for
 * continuous read-only Polymarket L2 orderbook collection.
 * Modeled outputs are never provisioning authorization or a guaranteed bill cap.
 */
import {
  L2_COST_PRICING_SOURCES,
  resolveL2CostAssumptions,
  r2PricingStatus,
  roundCost,
  vpsPricingStatus,
} from './l2-collector-cost-assumptions';
import { projectL2MarketTier } from './l2-collector-cost-projection';
import type { L2CostModelInput, L2CostModelReport } from './l2-collector-cost-types';

export { L2_COST_PRICING_SOURCES } from './l2-collector-cost-assumptions';
export type {
  L2ArtifactStorageProjection,
  L2BudgetHoldReason,
  L2CostAssumptions,
  L2CostModelInput,
  L2CostModelReport,
  L2MandatoryCosts,
  L2MarketTierProjection,
  L2NumberRange,
  L2PricingStatus,
  L2R2Billing,
  L2RatioRange,
} from './l2-collector-cost-types';

const MODEL_LIMITATIONS = [
  'Legacy input name measuredBytes does not verify throughput; provenance stays UNVERIFIED unless an evidence note is supplied.',
  'Compression ratios and Parquet raw-equivalent size are modeled, not measured; the 1x-compression stress case is always reported separately.',
  'R2 storage rounds up per whole GB-month and Class A/B operations round up per million, independently; no shared free allowance is deducted.',
  'VPS list price proves neither CPU/RAM/disk capacity, region eligibility, nor transfer headroom for the modeled load.',
  'Taxes, data licensing, bandwidth overage, restores/retries, and connected services are caller estimates or unknown; billing alerts are not spending caps.',
  'The $30 budget check fails closed on unknown mandatory costs, minimum/range overruns, or 1x compression stress; a pass is not provisioning authorization.',
  'Stopping collection does not delete stored data or stop storage charges; market count and retention are never reduced to fit the budget.',
] as const;

export function estimateL2CollectionStorageAndCost(input: L2CostModelInput): L2CostModelReport {
  const assumptions = resolveL2CostAssumptions(input);
  const hours = input.durationSec / 3600;
  const bytesPerMarketHour = input.measuredBytes / (input.measuredMarkets * hours);
  if (!Number.isFinite(bytesPerMarketHour) || bytesPerMarketHour < 0) {
    throw new RangeError(`Computed bytesPerMarketHour is invalid: ${bytesPerMarketHour}`);
  }

  const vpsStatus = vpsPricingStatus(input);
  const projections = assumptions.targetMarketTiers.map((targetMarkets) =>
    projectL2MarketTier(assumptions, targetMarkets, bytesPerMarketHour, vpsStatus),
  );

  return {
    measuredBytes: input.measuredBytes,
    durationSec: input.durationSec,
    measuredMarkets: input.measuredMarkets,
    bytesPerMarketHour: roundCost(bytesPerMarketHour, 2),
    compressionRatioRange: [...assumptions.compressionRatioRange],
    r2RateUsdPerGbMonth: assumptions.r2RateUsdPerGbMonth,
    inputs: { ...input },
    assumptions,
    provenance: {
      projection: 'MODELED',
      throughput: input.throughputProvenance ?? 'UNVERIFIED',
      throughputSourceNote: input.throughputSourceNote
        ?? 'No throughput evidence supplied; the legacy measuredBytes name does not verify measurement.',
      compression: 'MODELED',
      parquetSize: 'MODELED',
      vpsPricing: vpsStatus,
      vpsCapacityAdequacy: 'UNVERIFIED',
      r2Pricing: r2PricingStatus(input),
      nonStorageCosts: 'CALLER_ESTIMATES_OR_UNKNOWN',
    },
    pricingSources: {
      accessedDate: L2_COST_PRICING_SOURCES.accessedDate,
      cloudflareR2: { ...L2_COST_PRICING_SOURCES.cloudflareR2 },
      digitalOceanDroplets: { ...L2_COST_PRICING_SOURCES.digitalOceanDroplets },
    },
    limitations: [...MODEL_LIMITATIONS],
    projections,
  };
}
