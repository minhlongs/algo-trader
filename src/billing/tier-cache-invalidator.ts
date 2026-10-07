/**
 * Tier Cache Invalidator Helper
 * Immediately clears tenant subscription caches (e.g. Cloudflare KV)
 * upon tier downgrade, refund, or expiration.
 */

import { logger } from '../shared/utils/logger';
import type { TierInvalidationCallback, TierInvalidationEvent } from './tier-activation-types';

export interface KvNamespaceLike {
  delete(key: string): Promise<unknown>;
  get?(key: string): Promise<string | null>;
  put?(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Creates an invalidator callback that deletes `tier:${tenantId}` from Cloudflare KV.
 */
export function createKvTierInvalidator(
  kvNamespace?: KvNamespaceLike
): TierInvalidationCallback {
  return async (tenantId: string, event: TierInvalidationEvent): Promise<void> => {
    if (!kvNamespace) {
      logger.debug(`[TierCacheInvalidator] No KV namespace configured for tenant ${tenantId}`);
      return;
    }
    const cacheKey = `tier:${tenantId}`;
    try {
      await kvNamespace.delete(cacheKey);
      logger.info(`[TierCacheInvalidator] Evicted KV cache key ${cacheKey} on ${event.status}`);
    } catch (err) {
      logger.error(`[TierCacheInvalidator] Failed to evict KV cache key ${cacheKey}:`, { err });
    }
  };
}

/**
 * Direct invalidation helper for a specific tenant ID.
 */
export async function invalidateTenantCache(
  tenantId: string,
  kvNamespace?: KvNamespaceLike,
  reason = 'manual'
): Promise<void> {
  const invalidator = createKvTierInvalidator(kvNamespace);
  await invalidator(tenantId, { status: reason, paymentId: 'manual' });
}
