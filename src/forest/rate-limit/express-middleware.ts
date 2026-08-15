/**
 * Express middleware for Redis-backed tier-based rate limiting.
 *
 * @module forest/rate-limit/express-middleware
 */

import { logger } from '../../shared/utils/logger';
import type { Request, Response, NextFunction } from 'express';
import {
  resolveLimits,
} from './tier-config';
import { validateKeyPrefix } from './key-validation';
import type { RedisRateLimiter, RateLimitResult } from './redis-rate-limiter';

// ─── Middleware Options ────────────────────────────────────────────────────────

export interface RateLimitMiddlewareOptions {
  /** Extract userId from the request. Defaults to `req.user?.id` + `x-user-id`. */
  getUserId?: (req: Request) => string | undefined;
  /** Extract tier from the request. Defaults to `req.user?.tier`, falls back to 'FREE'. */
  getTier?: (req: Request) => string;
  /** Alternate rate-limiter instance. Defaults to the shared singleton. */
  limiter?: RedisRateLimiter;
  /** Optional Redis key prefix override (multi-tenant isolation). */
  keyPrefix?: string;
  /** When true, requests without userId are allowed (no rate-limit key). Default false. */
  allowAnonymous?: boolean;
}

// ─── Core Middleware ──────────────────────────────────────────────────────────

/**
 * Express middleware: per-user tier-based rate limiting.
 *
 * Headers set on every response:
 *   - `X-RateLimit-Limit`     — max requests per window
 *   - `X-RateLimit-Remaining` — requests left in current window
 *   - `X-RateLimit-Reset`     — ISO timestamp when window resets
 *   - `Retry-After`           — seconds to wait (only on 429)
 */
export function rateLimitMiddleware(
  options: RateLimitMiddlewareOptions = {},
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const prefix = validateKeyPrefix(options.keyPrefix);
  const getUserId = options.getUserId ?? defaultGetUserId;
  const getTier = options.getTier ?? defaultGetTier;

  return async (req, res, next) => {
    const userId = getUserId(req) ?? getClientIp(req);

    if (!userId) {
      if (!options.allowAnonymous) {
        logger.error('[RateLimiter] No userId or client IP — request rejected (allowAnonymous=false)', {
          path: req.path, method: req.method,
        });
        res.status(500).json({
          error: 'RATE_LIMIT_CONFIG_ERROR',
          message: 'Rate limiter requires user identity or allowAnonymous=true',
        });
        return;
      }
      logger.warn('[RateLimiter] No userId or client IP — allowing (allowAnonymous=true)', {
        path: req.path, method: req.method,
      });
      next();
      return;
    }

    const tier = getTier(req);

    let result: RateLimitResult;
    try {
      result = await (options.limiter ?? (await import('./redis-rate-limiter')).rateLimiter)
        .checkRateLimit(userId, tier, { endpoint: req.path });

      res.setHeader('X-RateLimit-Limit', resolveLimits(tier).requestsPerMin.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());
    } catch {
      logger.error('[RateLimiter] Middleware unexpected error', {
        userId, tier, path: req.path,
      });
      next();
      return;
    }

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
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
  return (req.user as { id?: string })?.id
    ?? (req.headers['x-user-id'] as string | undefined);
}

function defaultGetTier(req: Request): string {
  return (req.user?.tier as string) ?? 'FREE';
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  const candidate =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ??
    safeReqIp(req) ??
    req.socket?.remoteAddress;
  return candidate ? `ip:${candidate}` : undefined;
}

function safeReqIp(req: Request): string | undefined {
  if (!req.socket) return undefined;
  try { return req.ip; } catch { return undefined; }
}
