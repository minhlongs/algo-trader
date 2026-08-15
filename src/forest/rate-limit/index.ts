/**
 * @module forest/rate-limit
 * Barrel export for the rate-limit package.
 */

export {
  TIER_RATE_LIMITS,
  DEFAULT_TIER_LIMITS,
  resolveLimits,
  type TierRateLimits,
} from './tier-config';

export {
  RedisRateLimiter,
  rateLimiter,
  type RateLimitResult,
  type RedisRateLimiterOptions,
  type CheckRateLimitOptions,
} from './redis-rate-limiter';

export {
  rateLimitMiddleware,
  type RateLimitMiddlewareOptions,
} from './express-middleware';

export { validateKeyPrefix } from './key-validation';
