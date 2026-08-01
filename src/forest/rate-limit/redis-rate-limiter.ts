/**
 * Redis Rate Limiter — Sliding Window Algorithm
 *
 * Tier-based per-user rate limiting using Redis sorted sets.
 * Gracefully degrades (allows + logs) when Redis is unavailable.
 *
 * @module forest/rate-limit/redis-rate-limiter
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';
import type { Request, Response, NextFunction } from 'express';
import { emitRateLimitAuditEvent } from './audit-hook';
import { validateTenantId, type TenantId } from '../../shared/tenant';

// ─── Tier Limits ──────────────────────────────────────────────────────────────

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
export const TIER_RATE_LIMITS: Record<string, TierRateLimits> = {
 FREE: {
  requestsPerMin: 10,
  burstPerSec: 2,
 },
 PRO: {
  requestsPerMin: 100,
  burstPerSec: 5,
 },
 ENTERPRISE: {
  requestsPerMin: 1000,
  burstPerSec: 20,
 },
 MASTER: {
  requestsPerMin: 0,
  burstPerSec: 0,
 },
};

/**
 * Fallback limits for unknown or missing tiers.
 * Chosen conservatively: strict enough to protect the API, loose enough
 * to not repeatedly block legitimate traffic.
 */
export const DEFAULT_TIER_LIMITS: TierRateLimits = {
  requestsPerMin: 60,
  burstPerSec: 3,
};

// ─── Redis Key Namespace ───────────────────────────────────────────────────────

const RATE_LIMIT_PREFIX = 'ratelimit';

/**
 * Generate a Redis key for the sliding window sorted set.
 */
function slidingWindowKey(userId: string, windowSeconds: number): string {
  return `${RATE_LIMIT_PREFIX}:${userId}:${windowSeconds}s`;
}

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
 * If Redis is unreachable, all requests are allowed (graceful degradation)
 * and a warning is logged.
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
   * @param tier   - License tier string (BASIC | PREMIUM | ENTERPRISE | MASTER)
   * @returns      Rate-limit verdict with remaining count and reset timestamp
   */
  async checkRateLimit(
    userId: string,
    tier: string,
  options: CheckRateLimitOptions = {},
  ): Promise<RateLimitResult> {
    const limits = this.resolveLimits(tier);
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
const retryAfter = Math.max(
 0,
 Math.ceil((now + this.windowSeconds * 1000 - Date.now()) / 1000),
);
if (!validateTenantId(userId)) {
 logger.warn(`[RateLimiter] skipping audit for invalid tenantId: ${userId}`);
}
try {
 await emitRateLimitAuditEvent({
  tenantId: validateTenantId(userId) ? (userId as TenantId) : (() => { throw new Error(`Invalid userId for audit: ${userId}`) })(),
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
      // ── Graceful degradation ──────────────────────────────────────────────
      // When Redis is down we allow the request rather than hard-blocking.
      // The operator still gets a warning in logs for alerting.
      logger.warn('[RateLimiter] Redis unavailable — allowing request (deg)', {
        cause: err instanceof Error ? err.message : String(err),
        userId,
        tier,
      });

      return {
        allowed: true,
        remaining: limits.requestsPerMin,
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

  // ─── Internal ────────────────────────────────────────────────────────────

  /**
   * Resolve tier name (case-insensitive) to rate-limit config.
   * Falls back to DEFAULT_TIER_LIMITS for unrecognised tiers.
   */
  private resolveLimits(tier: string): TierRateLimits {
    const normalized = tier.toUpperCase();
    return TIER_RATE_LIMITS[normalized] ?? DEFAULT_TIER_LIMITS;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/** Default shared rate-limiter instance (60-second window). */
export const rateLimiter = new RedisRateLimiter();

// ─── Express Middleware ───────────────────────────────────────────────────────

export interface RateLimitMiddlewareOptions {
  /**
   * Extract userId from the request.
   * Defaults to `req.user?.id` or `req.headers['x-user-id']`.
   */
  getUserId?: (req: Request) => string | undefined;

  /**
   * Extract tier from the request.
   * Defaults to `req.user?.tier`, falls back to 'BASIC'.
   */
  getTier?: (req: Request) => string;

  /**
   * Alternate rate-limiter instance. Defaults to the shared `rateLimiter`.
   */
  limiter?: RedisRateLimiter;

  /**
   * Optional Redis key prefix override (multi-tenant isolation).
   */
  keyPrefix?: string;
}

/**
 * Express middleware: per-user tier-based rate limiting.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { rateLimiterMiddleware } from '@/forest/rate-limit/redis-rate-limiter';
 *
 * const app = express();
 *
 * // Default: reads req.user?.id and req.user?.tier
 * app.use('/api', rateLimiterMiddleware());
 *
 * // Custom extraction
 * app.use('/api', rateLimiterMiddleware({
 *   getUserId: (req) => req.headers['x-api-key'] as string,
 *   getTier:    (req) => req.headers['x-tier'] as string || 'BASIC',
 * }));
 * ```
 *
 * Headers set on every response:
 *   - `X-RateLimit-Limit`    — max requests per window
 *   - `X-RateLimit-Remaining` — requests left in current window
 *   - `X-RateLimit-Reset`    — ISO timestamp when window resets
 *   - `Retry-After`          — seconds to wait (only on 429)
 *
 * Rejection: HTTP 429 `{ error: 'RATE_LIMIT_EXCEEDED', resetAt, remaining }`.
 * Redis down: request passes through (graceful degradation).
 */
export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions = {},
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const limiter = options.limiter ?? rateLimiter;
  const prefix = options.keyPrefix ?? '';
  const getUserId = options.getUserId ?? defaultGetUserId;
  const getTier = options.getTier ?? defaultGetTier;

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = getUserId(req);

    if (!userId) {
      // No user context — skip rate limiting (public endpoint).
      // If you need to protect public endpoints, provide a getUserId that
      // returns a stable identifier (e.g. IP address or api key fingerprint).
      logger.warn('[RateLimiter] No userId in request — skipping', {
        path: req.path,
        method: req.method,
      });
      next();
      return;
    }

    const tier = getTier(req);

    let result: RateLimitResult;

    try {
      result = await limiter.checkRateLimit(userId, tier, { endpoint: req.path });

      res.setHeader('X-RateLimit-Limit', resolveLimits(tier).requestsPerMin.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
    } catch {
      // Defensive: checkRateLimit already handles graceful degradation,
      // but if the SKIP_CHECK path itself throws we must not break the chain.
      logger.error('[RateLimiter] Middleware unexpected error', {
        userId,
        tier,
        path: req.path,
      });
      next();
      return;
    }

    if (!result.allowed) {
      const retryAfter = Math.ceil(
        (result.resetAt.getTime() - Date.now()) / 1000,
      );
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit exceeded. Retry after ${result.resetAt.toISOString()}`,
        resetAt: result.resetAt.toISOString(),
        remaining: 0,
      });
      return;
    }

    next();
  };
}

// ─── Default Helpers ──────────────────────────────────────────────────────────

function defaultGetUserId(req: Request): string | undefined {
  return req.user?.id
?? (req.headers['x-user-id'] as string | undefined);
}

function defaultGetTier(req: Request): string {
  return (req.user?.tier as string) ?? 'FREE';
}

function resolveLimits(tier: string): TierRateLimits {
  const normalized = tier.toUpperCase();
  return TIER_RATE_LIMITS[normalized] ?? DEFAULT_TIER_LIMITS;
}
