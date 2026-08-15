/**
 * Tier-based rate-limit configuration.
 *
 * Each tier maps to a requests-per-minute ceiling and a burst ceiling.
 * MASTER = unlimited (requestsPerMin = 0).
 *
 * @module forest/rate-limit/tier-config
 */

import type { TierLabel } from '../../seed/config/tiers';

export interface TierRateLimits {
  requestsPerMin: number;
  burstPerSec: number;
}

/**
 * Canonical tier → rate-limit mapping.
 *
 * Import from @forest/rate-limit in middleware; these values are the
 * source of truth for the rate-limiter.
 *
 * @see ../../seed/config/tiers for the platform's canonical tier config.
 */
export const TIER_RATE_LIMITS: Record<TierLabel, TierRateLimits> = {
  FREE: {
    requestsPerMin: 10,
    burstPerSec: 2,
  },
  PRO: {
    requestsPerMin: 100,
    burstPerSec: 20,
  },
  ENTERPRISE: {
    requestsPerMin: 1000,
    burstPerSec: 100,
  },
  MASTER: {
    requestsPerMin: 0,
    burstPerSec: 0,
  },
} as const;

/**
 * Fallback limits for unknown or missing tiers.
 * Defaults to FREE tier (10/min, 2/sec) — never more permissive than the
 * lowest known tier. Protects against tier-string typos and misconfigurations.
 */
export const DEFAULT_TIER_LIMITS: TierRateLimits = {
  requestsPerMin: 10,
  burstPerSec: 2,
};

/**
 * Resolve tier string to its rate-limit configuration.
 * Normalizes to uppercase; returns DEFAULT_TIER_LIMITS for unrecognized tiers.
 */
export function resolveLimits(tier: string): TierRateLimits {
  const normalized = tier.toUpperCase() as TierLabel;
  return TIER_RATE_LIMITS[normalized] ?? DEFAULT_TIER_LIMITS;
}
