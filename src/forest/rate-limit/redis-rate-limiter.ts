/**
 * Redis Rate Limiter — Sliding Window Algorithm
 *
 * Tier-based per-user rate limiting using Redis sorted sets.
 * Gracefully degrades (allows + logs) when Redis is unavailable.
 * Falls back to in-memory LRU rate limiter on Redis errors.
 *
 * @module forest/rate-limit/redis-rate-limiter
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';
import { emitRateLimitAuditEvent } from './audit-hook';
import { validateTenantId, type TenantId } from '../../shared/tenant';
import { TIER_RATE_LIMITS, DEFAULT_TIER_LIMITS } from './tier-config';
import type { TierLabel } from '../../seed/config/tiers';
import { MemoryRateLimiter } from '../../shared/rate-limit/memory-fallback';

export { TIER_RATE_LIMITS, DEFAULT_TIER_LIMITS, resolveLimits, type TierRateLimits } from './tier-config';
export { rateLimitMiddleware, type RateLimitMiddlewareOptions } from './express-middleware';

// ─── Redis Key Namespace ──────────────────────────────────────────────────────

const RATE_LIMIT_PREFIX = 'ratelimit';

/**
 * Generate a Redis key for the sliding window sorted set.
 */
function slidingWindowKey(userId: string, windowSeconds: number): string {
  return `${RATE_LIMIT_PREFIX}:${userId}:${windowSeconds}s`;
}

// ─── In-Memory Fallback Instance ──────────────────────────────────────────────

const memoryFallback = new MemoryRateLimiter();

// ─── Rate Limiter Service ─────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface CheckRateLimitOptions {
  endpoint?: string;
}

export interface RedisRateLimiterOptions {
  /**
   * Window duration in seconds. Default 60 (standard 1-minute rate limit).
   */
  windowSeconds?: number;
  /**
   * Redis key TTL in seconds. Should be >= windowSeconds to ensure the key
   * survives the full window. Defaults to windowSeconds + 10.
   */
  keyTtlSeconds?: number;
}

/**
 * Per-user rate limiter backed by a Redis sorted-set sliding window.
 *
 * Algorithm (atomic via pipeline):
 *  1. ZREMRANGEBYSCORE key 0 <cutoff>   — evict entries older than window
 *  2. ZADD key <now_ms> <now_ms>         — record the current request
 *  3. EXPIRE key <ttl>                   — auto-cleanup when window passes
 *  4. ZCARD key                          — count entries in window
 *
 * If Redis is unreachable, falls back to in-memory LRU rate limiter.
 */
export class RedisRateLimiter {
  private readonly windowSeconds: number;
  private readonly keyTtlSeconds: number;

  constructor(options: RedisRateLimiterOptions = {}) {
    this.windowSeconds = options.windowSeconds ?? 60;
    this.keyTtlSeconds = options.keyTtlSeconds ?? this.windowSeconds + 10;
  }

  /**
   * Check whether a request from `userId` at `tier` should be allowed.
   *
   * @param userId - Unique user identifier (e.g. session userId, api key id)
   * @param tier   - License tier string (FREE | PRO | ENTERPRISE | MASTER)
   * @returns      Rate-limit verdict with remaining count and reset timestamp
   */
  async checkRateLimit(
    userId: string,
    tier: string,
    options: CheckRateLimitOptions = {},
  ): Promise<RateLimitResult> {
    const limits = TIER_RATE_LIMITS[tier.toUpperCase() as TierLabel] ?? DEFAULT_TIER_LIMITS;

    // MASTER tier = unlimited
    if (tier.toUpperCase() === 'MASTER' || limits.requestsPerMin === 0) {
      return {
        allowed: true,
        remaining: 0,
        resetAt: new Date(Date.now() + this.windowSeconds * 1000),
      };
    }

    const key = slidingWindowKey(userId, this.windowSeconds);
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;

    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();

      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zadd(key, now, now);
      pipeline.expire(key, this.keyTtlSeconds);

      await pipeline.exec();

      const count = await redis.zcard(key);
      const allowed = count <= limits.requestsPerMin;

      if (!allowed) {
        logger.warn('[RateLimiter] Rate limit exceeded', {
          userId,
          tier,
          count,
          limit: limits.requestsPerMin,
          windowSeconds: this.windowSeconds,
        });
      }

      const retryAfter = Math.max(
        0,
        Math.ceil((now + this.windowSeconds * 1000 - Date.now()) / 1000),
      );

      // Audit only when the rate limit is actually exceeded. Firing on every
      // request would flood the audit log with noise and break the invariant
      // that a successful request carries no rate-limit audit event.
      if (!allowed && validateTenantId(userId)) {
        try {
          await emitRateLimitAuditEvent({
            tenantId: userId as TenantId,
            tier,
            endpoint: options.endpoint ?? '',
            remainingMs: 0,
            retryAfter,
          });
        } catch (auditErr) {
          logger.warn('[RateLimiter] audit hook failed', {
            cause: auditErr instanceof Error ? auditErr.message : String(auditErr),
          });
        }
      }

      return {
        allowed,
        remaining: Math.max(0, limits.requestsPerMin - count),
        resetAt: new Date(now + this.windowSeconds * 1000),
      };
    } catch (err) {
      // Fallback to in-memory LRU rate limiter when Redis is unavailable
      const windowMs = this.windowSeconds * 1000;

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
        resetAt: new Date(now + this.windowSeconds * 1000),
      };
    }
  }

  /**
   * Peek at the current request count for `userId` without incrementing.
   * Useful for dashboards or pre-flight UI hints.
   *
   * Returns 0 on Redis failure.
   */
  async getCurrentCount(userId: string): Promise<number> {
    const key = slidingWindowKey(userId, this.windowSeconds);

    try {
      const redis = getRedisClient();
      return await redis.zcard(key);
    } catch (err) {
      logger.warn('[RateLimiter] getCurrentCount failed — Redis unavailable', {
        cause: err instanceof Error ? err.message : String(err),
        userId,
      });
      return 0;
    }
  }

  /**
   * Reset the rate-limit window for `userId`.
   * Primarily for admin use-cases and integration tests.
   */
  async reset(userId: string): Promise<void> {
    const key = slidingWindowKey(userId, this.windowSeconds);

    try {
      const redis = getRedisClient();
      await redis.del(key);
    } catch (err) {
      logger.warn('[RateLimiter] reset failed — Redis unavailable', {
        cause: err instanceof Error ? err.message : String(err),
        userId,
      });
    }
  }
}

export const rateLimiter = new RedisRateLimiter();