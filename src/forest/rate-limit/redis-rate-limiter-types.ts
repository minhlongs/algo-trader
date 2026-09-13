/**
 * Redis Rate Limiter — Types and options.
 *
 * @module forest/rate-limit/redis-rate-limiter-types
 */

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
  /**
   * Optional max requests override.
   */
  maxRequests?: number;
}
