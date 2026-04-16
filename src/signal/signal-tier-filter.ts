/**
 * Signal Tier Filter
 * Filters signals visible to a subscriber based on their license tier.
 * FREE=daily digest, PRO=hourly window, ENTERPRISE=realtime (no filter).
 */

import type { Signal, TierKey } from './signal-types';
import { TIER_SIGNAL_CONFIG } from './signal-types';

/**
 * Filter signals array to those visible for the given tier.
 * - ENTERPRISE: all signals above min confidence, no time window restriction
 * - PRO: signals within last hour, above min confidence
 * - FREE: only the most recent signal per market within last 24h (digest)
 */
export function filterSignalsForTier(signals: Signal[], tier: TierKey): Signal[] {
  const config = TIER_SIGNAL_CONFIG[tier];
  const now = Date.now();
  const windowStart = config.minIntervalMs > 0 ? now - config.minIntervalMs : 0;

  // Filter by confidence and non-expired
  const eligible = signals.filter(
    (s) => s.confidence >= config.minConfidence && s.expiresAt > now
  );

  if (tier === 'ENTERPRISE') {
    return eligible.sort((a, b) => b.ts - a.ts);
  }

  if (tier === 'PRO') {
    return eligible
      .filter((s) => s.ts >= windowStart)
      .sort((a, b) => b.ts - a.ts);
  }

  // FREE: daily digest — one most-recent signal per market
  const windowFiltered = eligible.filter((s) => s.ts >= windowStart);
  const bestByMarket = new Map<string, Signal>();
  for (const sig of windowFiltered) {
    const existing = bestByMarket.get(sig.market);
    if (!existing || sig.ts > existing.ts) {
      bestByMarket.set(sig.market, sig);
    }
  }
  return Array.from(bestByMarket.values()).sort((a, b) => b.ts - a.ts);
}

/**
 * Determine if a tier can access SSE realtime stream.
 */
export function canAccessSse(tier: TierKey): boolean {
  return TIER_SIGNAL_CONFIG[tier].sseEnabled;
}

/**
 * Determine if a new signal should be pushed immediately to this tier.
 * Returns true only for ENTERPRISE (realtime push).
 */
export function shouldPushRealtime(tier: TierKey): boolean {
  return tier === 'ENTERPRISE';
}
