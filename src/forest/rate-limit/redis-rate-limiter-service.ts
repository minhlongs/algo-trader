/**
 * Redis Rate Limiter — Service implementation.
 *
 * @module forest/rate-limit/redis-rate-limiter-service
 */

import { getRedisClient } from '../../redis/index';
import { logger } from '../../shared/utils/logger';
import { TIER_RATE_LIMITS, DEFAULT_TIER_LIMITS } from './tier-config';
import type { TierLabel } from '../../seed/config/tiers';
import type {
  RateLimitResult,
  CheckRateLimitOptions,
  RedisRateLimiterOptions,
} from './redis-rate-limiter-types';
import {
  slidingWindowKey,
  executeRateLimitAudit,
  executeMemoryFallback,
} from './redis-rate-limiter-helpers';

/**
 * Per-user rate limiter backed by a Redis sorted-set sliding window.
 */
export class RedisRateLimiter {
  private readonly windowSeconds: number;
  private readonly keyTtlSeconds: number;

  constructor(options: RedisRateLimiterOptions = {}) {
    this.windowSeconds = options.windowSeconds ?? 60;
    this.keyTtlSeconds = options.keyTtlSeconds ?? this.windowSeconds + 10;
  }

  async checkRateLimit(
    userId: string,
    tier: string,
    options: CheckRateLimitOptions = {},
  ): Promise<RateLimitResult> {
    const limits = TIER_RATE_LIMITS[tier.toUpperCase() as TierLabel] ?? DEFAULT_TIER_LIMITS;

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

      if (!allowed) {
        await executeRateLimitAudit(userId, tier, options.endpoint, retryAfter);
      }

      return {
        allowed,
        remaining: Math.max(0, limits.requestsPerMin - count),
        resetAt: new Date(now + this.windowSeconds * 1000),
      };
    } catch (err) {
      return await executeMemoryFallback(err, userId, tier, limits, this.windowSeconds, now);
    }
  }

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
