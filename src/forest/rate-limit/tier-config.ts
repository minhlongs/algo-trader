/**
 * Tier-based rate-limit configuration.
 *
 * Initialized from canonical tiers in @seed/config/tiers.
 * Re-exported here for backward compatibility and test override support.
 *
 * @module forest/rate-limit/tier-config
 */

import {
  TIER_RATE_LIMITS as CANONICAL_TIER_RATE_LIMITS,
  DEFAULT_TIER_LIMITS,
  getTierRateLimits,
  type TierLabel,
  type TierRateLimits,
} from '../../seed/config/tiers';

export const TIER_RATE_LIMITS: Record<TierLabel, TierRateLimits> = {
  ...CANONICAL_TIER_RATE_LIMITS,
};

export {
  DEFAULT_TIER_LIMITS,
  getTierRateLimits,
  type TierLabel,
  type TierRateLimits,
};

/**
 * Resolve tier string to its rate-limit configuration.
 * Normalizes to uppercase; falls back to DEFAULT_TIER_LIMITS.
 */
export function resolveLimits(tier: string): TierRateLimits {
  const normalized = tier.toUpperCase() as TierLabel;
  return TIER_RATE_LIMITS[normalized] ?? DEFAULT_TIER_LIMITS;
}
