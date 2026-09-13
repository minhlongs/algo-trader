/**
 * Redis Rate Limiter — Helpers, namespace keys, and fallbacks.
 *
 * @module forest/rate-limit/redis-rate-limiter-helpers
 */

import { logger } from '../../shared/utils/logger';
import { emitRateLimitAuditEvent } from './audit-hook';
import { validateTenantId, type TenantId } from '../../shared/tenant';
import type { TierRateLimits } from './tier-config';
import { MemoryRateLimiter } from '../../shared/rate-limit/memory-fallback';
import type { RateLimitResult } from './redis-rate-limiter-types';

export const RATE_LIMIT_PREFIX = 'ratelimit';

/**
 * Generate a Redis key for the sliding window sorted set.
 */
export function slidingWindowKey(userId: string, windowSeconds: number): string {
  return `${RATE_LIMIT_PREFIX}:${userId}:${windowSeconds}s`;
}

export const memoryFallback = new MemoryRateLimiter();

export async function executeRateLimitAudit(
  userId: string,
  tier: string,
  endpoint: string | undefined,
  retryAfter: number,
): Promise<void> {
  if (!validateTenantId(userId)) return;

  try {
    await emitRateLimitAuditEvent({
      tenantId: userId as TenantId,
      tier,
      endpoint: endpoint ?? '',
      remainingMs: 0,
      retryAfter,
    });
  } catch (auditErr) {
    logger.warn('[RateLimiter] audit hook failed', {
      cause: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }
}

export async function executeMemoryFallback(
  err: unknown,
  userId: string,
  tier: string,
  limits: TierRateLimits,
  windowSeconds: number,
  now: number,
): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;

  const fallback = await memoryFallback.checkLimit({
    userId,
    limit: limits.requestsPerMin,
    windowMs,
  });

  logger.warn('[RateLimiter] Redis unavailable — using in-memory fallback', {
    cause: err instanceof Error ? err.message : String(err),
    userId,
    tier,
    fallbackAllowed: fallback.allowed,
    fallbackRemaining: fallback.remaining,
  });

  return {
    allowed: fallback.allowed,
    remaining: fallback.remaining,
    resetAt: new Date(now + windowSeconds * 1000),
  };
}
