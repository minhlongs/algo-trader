/**
 * Canonical Tier Configuration
 *
 * Single source of truth for tier definitions and rate limits.
 * All layers import from here — no duplicate tier logic.
 *
 * @module seed/config/tiers
 */

/** Canonical tier labels — uppercase only */
export type TierLabel = 'FREE' | 'PRO' | 'ENTERPRISE' | 'MASTER';

/** Tier configuration interface */
export interface TierConfig {
  readonly label: TierLabel;
  readonly displayName: string;
  readonly rateLimit: {
    readonly requestsPerMin: number;
    readonly burstPerSec: number;
  };
  readonly features: readonly string[];
}

/** Rate limit type for the rate limiter */
export interface TierRateLimits {
  readonly requestsPerMin: number;
  readonly burstPerSec: number;
}

/**
 * Canonical tier configurations.
 *
 * Rate limits:
 * - FREE: 10 req/min, 2 burst/sec
 * - PRO: 100 req/min, 20 burst/sec
 * - ENTERPRISE: 1000 req/min, 100 burst/sec
 * - MASTER: unlimited (0 = no limit)
 */
export const TIER_CONFIGS: readonly TierConfig[] = [
  {
    label: 'FREE',
    displayName: 'Free',
    rateLimit: { requestsPerMin: 10, burstPerSec: 2 },
    features: ['basic_signals', 'basic_analytics'],
  },
  {
    label: 'PRO',
    displayName: 'Pro',
    rateLimit: { requestsPerMin: 100, burstPerSec: 20 },
    features: ['basic_signals', 'basic_analytics', 'advanced_signals', 'webhook_delivery'],
  },
  {
    label: 'ENTERPRISE',
    displayName: 'Enterprise',
    rateLimit: { requestsPerMin: 1000, burstPerSec: 100 },
    features: [
      'basic_signals',
      'basic_analytics',
      'advanced_signals',
      'webhook_delivery',
      'custom_integrations',
      'priority_support',
    ],
  },
  {
    label: 'MASTER',
    displayName: 'Master',
    rateLimit: { requestsPerMin: 0, burstPerSec: 0 }, // 0 = unlimited
    features: [
      'basic_signals',
      'basic_analytics',
      'advanced_signals',
      'webhook_delivery',
      'custom_integrations',
      'priority_support',
      'unlimited_api',
      'white_label',
    ],
  },
] as const;

/** Quick lookup by tier label */
export const TIER_CONFIG: Readonly<Record<TierLabel, TierConfig>> = {
  FREE: TIER_CONFIGS[0],
  PRO: TIER_CONFIGS[1],
  ENTERPRISE: TIER_CONFIGS[2],
  MASTER: TIER_CONFIGS[3],
} as const;

/** Rate limits extracted for the rate limiter */
export const TIER_RATE_LIMITS: Readonly<Record<TierLabel, TierRateLimits>> = {
  FREE: { requestsPerMin: 10, burstPerSec: 2 },
  PRO: { requestsPerMin: 100, burstPerSec: 20 },
  ENTERPRISE: { requestsPerMin: 1000, burstPerSec: 100 },
  MASTER: { requestsPerMin: 0, burstPerSec: 0 },
} as const;

/** Default limits for unknown tiers (fail-safe to FREE) */
export const DEFAULT_TIER_LIMITS: TierRateLimits = TIER_RATE_LIMITS.FREE;

/**
 * Get rate limits for a tier label.
 * Normalizes input to uppercase and falls back to FREE.
 */
export function getTierRateLimits(tier: string): TierRateLimits {
  const normalized = tier.toUpperCase() as TierLabel;
  return TIER_RATE_LIMITS[normalized] ?? DEFAULT_TIER_LIMITS;
}

/**
 * Check if a tier has unlimited rate limits.
 */
export function isUnlimitedTier(tier: string): boolean {
  const limits = getTierRateLimits(tier);
  return limits.requestsPerMin === 0;
}

/**
 * Validate tier label.
 */
export function isValidTier(tier: string): tier is TierLabel {
  return tier.toUpperCase() in TIER_CONFIG;
}