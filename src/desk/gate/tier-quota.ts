/**
 * Tier Quota Lookups
 *
 * Thin accessors over the per-tier rate-limit and quota configuration.
 * Extracted from the license validators so quota reads never drag the
 * feature-gating assertions into the same surface.
 */

import { TIER_CONFIG } from './config/tier-config';
import { LicenseTier } from '../../shared/types/license';

/** Burst/window rate limits applied to a tier. */
export interface RateLimits {
  requestsPerMin: number;
  requestsPerHour: number;
  burstPerSec: number;
}

/** Get rate limit configuration for tier */
export function getRateLimits(tier: LicenseTier): RateLimits {
  return TIER_CONFIG[tier];
}

/** Get daily API limit for tier */
export function getDailyLimit(tier: LicenseTier): number {
  return TIER_CONFIG[tier].dailyApiLimit;
}

/** Calculate overage price for tier */
export function getOveragePrice(tier: LicenseTier): number {
  return TIER_CONFIG[tier].overagePrice;
}
