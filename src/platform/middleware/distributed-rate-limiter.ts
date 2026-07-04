import { Request, Response, NextFunction } from 'express';
import { getRedisClient, RedisClientType } from '../../redis';
import { LicenseService } from '../billing/license-service';
import { LicenseTier } from '../../shared/types/license';
import { logger } from '../../shared/utils/logger';

// Excluded routes from rate limiting
const EXCLUDED_PREFIXES = [
  '/api/health',
  '/api/webhooks',
  '/api/auth',
];

// Tier configs (requests per minute)
const TIER_LIMITS: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 10,
  [LicenseTier.PRO]: 100,
  [LicenseTier.ENTERPRISE]: 1000,
};

interface RateLimitingRedisClient {
  defineCommand(name: string, definition: { numberOfKeys: number; lua: string }): void;
  rateLimit(
    key: string,
    now: number,
    windowMs: number,
    limit: number
  ): Promise<[number, number]>;
}

/**
 * Distributed sliding window rate limiter middleware using Redis/Redis Cluster.
 */
export async function distributedRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const url = req.originalUrl || req.url;

  // Skip excluded routes
  if (EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    next();
    return;
  }

  // 1. Resolve tenant identity and pricing tier
  let apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7);
    }
  }

  let tenantId: string;
  let tier: LicenseTier = LicenseTier.FREE;

  if (apiKey) {
    const licenseService = LicenseService.getInstance();
    const license = licenseService.getLicenseByKey(apiKey);

    if (license && license.status === 'active') {
      tenantId = license.tenantId || license.id;
      tier = license.tier;
    } else {
      // Invalid/inactive license key: rate limit as anonymous FREE tier
      tenantId = req.ip || 'anonymous';
      tier = LicenseTier.FREE;
    }
  } else {
    // Anonymous request: fallback to IP address
    tenantId = req.ip || 'anonymous';
    tier = LicenseTier.FREE;
  }

  const limit = TIER_LIMITS[tier] || 10;
  const windowMs = 60000; // 1 minute sliding window

  // Redis Cluster key with hash tag to ensure slot consistency
  const redisKey = `ratelimit:{${tenantId}}`;

  try {
    const redis = getRedisClient() as RedisClientType & RateLimitingRedisClient;

    // Dynamically define Lua script command if not already defined on the ioredis client instance
    if (typeof redis.rateLimit !== 'function') {
      redis.defineCommand('rateLimit', {
        numberOfKeys: 1,
        lua: `
          local key = KEYS[1]
          local now = tonumber(ARGV[1])
          local window = tonumber(ARGV[2])
          local limit = tonumber(ARGV[3])
          local clearBefore = now - window

          -- Remove elements outside sliding window
          redis.call('zremrangebyscore', key, 0, clearBefore)
          
          -- Get current number of elements in the sliding window
          local currentRequests = redis.call('zcard', key)

          if currentRequests < limit then
              -- Add current request timestamp
              redis.call('zadd', key, now, now)
              -- Expire key slightly after the window duration to prevent memory leaks
              redis.call('expire', key, math.ceil(window / 1000) + 1)
              return {1, currentRequests + 1}
          else
              return {0, currentRequests}
          end
        `,
      });
    }

    const now = Date.now();
    const result = await redis.rateLimit(redisKey, now, windowMs, limit);
    const allowed = result[0];
    const currentCount = result[1];

    if (allowed === 0) {
      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      logger.warn(`[RateLimiter] Rate limit exceeded for tenant=${tenantId} tier=${tier} limit=${limit}`);
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Upgrade your plan for higher limits.',
        tier,
        limit,
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount).toString());

    next();
  } catch (error) {
    logger.error('[RateLimiter] Error executing rate limiting script:', error);
    // Fail-open: allow request to proceed without rate limit headers
    // when Redis is unavailable, to protect availability
    next();
  }
}
