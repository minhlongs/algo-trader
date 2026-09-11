/**
 * License Activation Rate Limiter
 * Rate limiting for license key activations using Redis
 */

import Redis from 'ioredis';
import { logger } from '../../shared/utils/logger';
import { config } from '../../shared/config/env';

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get Redis client for rate limiting
 */
export function getRedisClient(): Redis | null {
  try {
    const client = new Redis({
      host: config.REDIS_HOST,
      port: parseInt(config.REDIS_PORT, 10),
      password: config.REDIS_PASSWORD || undefined,
      retryStrategy: () => null, // Don't retry on failure
    });
    return client;
  } catch {
    return null;
  }
}

/**
 * Check rate limit for license activation
 * Returns true if allowed, false if exceeded
 */
export async function checkRateLimit(identifier: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const redis = getRedisClient();
  if (!redis) {
    // Redis unavailable - allow but log warning
    logger.warn('⚠️  Redis unavailable - rate limiting disabled\n');
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS, resetAt: 0 };
  }

  try {
    const key = `rate_limit:license_activation:${identifier}`;
    const now = Date.now();

    // Use Redis MULTI for atomic operations
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, now - RATE_LIMIT_WINDOW_MS);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));

    const results = await multi.exec();

    // Get count from ZCARD result (index 2)
    const count = (results?.[3]?.[1] as number) || 0;
    const remaining = Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - count);
    const resetAt = now + RATE_LIMIT_WINDOW_MS;

    return {
      allowed: count < RATE_LIMIT_MAX_ATTEMPTS,
      remaining,
      resetAt,
    };
  } catch (error) {
    logger.warn('⚠️  Rate limit check failed:', (error as Error).message);
    return { allowed: true, remaining: RATE_LIMIT_MAX_ATTEMPTS, resetAt: 0 };
  } finally {
    await redis.quit();
  }
}

/**
 * Record rate limit attempt
 */
export async function recordRateLimitHit(identifier: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const key = `rate_limit:license_activation:${identifier}`;
    const now = Date.now();
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
  } catch {
    // Ignore errors - rate limiting is best-effort
  } finally {
    await redis.quit();
  }
}

/**
 * Get client identifier for rate limiting
 * Uses IP address or wallet address if available
 */
export function getClientIdentifier(): string {
  // In CLI context, use a combination of hostname and timestamp
  // In server context, this would use IP or wallet
  const hostname = process.env.HOSTNAME || 'unknown';
  return `cli:${hostname}:${Date.now()}`;
}
