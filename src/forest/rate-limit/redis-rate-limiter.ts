/**
 * Redis Rate Limiter — Sliding Window Algorithm
 *
 * Tier-based per-user rate limiting using Redis sorted sets.
 * Gracefully degrades (allows + logs) when Redis is unavailable.
 * Falls back to in-memory LRU rate limiter on Redis errors.
 *
 * Decomposed into modular submodules. Re-exports 100% public contracts.
 *
 * @module forest/rate-limit/redis-rate-limiter
 */

export {
  TIER_RATE_LIMITS,
  DEFAULT_TIER_LIMITS,
  resolveLimits,
  type TierRateLimits,
} from './tier-config';

export {
  rateLimitMiddleware,
  type RateLimitMiddlewareOptions,
} from './express-middleware';

export type {
  RateLimitResult,
  CheckRateLimitOptions,
  RedisRateLimiterOptions,
} from './redis-rate-limiter-types';

export {
  RATE_LIMIT_PREFIX,
  slidingWindowKey,
  memoryFallback,
  executeRateLimitAudit,
  executeMemoryFallback,
} from './redis-rate-limiter-helpers';

export {
  RedisRateLimiter,
  rateLimiter,
} from './redis-rate-limiter-service';
