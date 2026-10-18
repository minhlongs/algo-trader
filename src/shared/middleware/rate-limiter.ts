/**
 * In-Memory Sliding Window Rate Limiter
 *
 * Pure in-memory implementation with no external dependencies.
 * Uses a Map keyed by client identifier to track request counts
 * within a sliding time window. Auto-cleans expired entries.
 *
 * @module shared/middleware/rate-limiter
 */

import type { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  /** Time window in milliseconds */
  windowMs?: number;
  /** Maximum requests allowed within the window */
  max?: number;
  /** Custom error message */
  message?: string;
  /** Function to extract the rate limit key from a request */
  keyGenerator?: (req: Request) => string;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
}

interface WindowEntry {
  windowStart: number;
  count: number;
}

/** Stores window data per key: key → { windowStart, count } */
const store = new Map<string, WindowEntry>();

/** Tracks cleanup interval IDs per limiter instance for cleanup on removal */
let globalCleanupTimer: ReturnType<typeof setInterval> | null = null;

function getDefaultKeyGenerator(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
    : req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

function cleanupExpiredEntries(windowMs: number): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > windowMs) {
      store.delete(key);
    }
  }
}

function startCleanupTimer(windowMs: number): void {
  if (globalCleanupTimer) return;
  globalCleanupTimer = setInterval(() => cleanupExpiredEntries(windowMs), windowMs);
  if (globalCleanupTimer.unref) {
    globalCleanupTimer.unref();
  }
}

function stopCleanupTimer(): void {
  if (globalCleanupTimer) {
    clearInterval(globalCleanupTimer);
    globalCleanupTimer = null;
  }
}

/**
 * Create an in-memory sliding window rate limiter middleware.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const {
    windowMs = 60_000,
    max = 100,
    message = 'Too many requests',
    keyGenerator = getDefaultKeyGenerator,
    skip,
  } = options;

  startCleanupTimer(windowMs);

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    if (skip && skip(req)) {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const entry = store.get(key);

    let windowStart: number;
    let count: number;

    if (!entry || now - entry.windowStart >= windowMs) {
      windowStart = now;
      count = 1;
    } else {
      windowStart = entry.windowStart;
      count = entry.count + 1;
    }

    store.set(key, { windowStart, count });

    const remaining = Math.max(0, max - count);
    const resetAt = windowStart + windowMs;

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (count > max) {
      const retryAfterSeconds = Math.ceil((resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

/** Clear all rate limit entries. Useful for testing. */
export function _clearStoreForTesting(): void {
  store.clear();
}

/** Stop the global cleanup timer. Useful for testing. */
export function _stopCleanupForTesting(): void {
  stopCleanupTimer();
}

/** Get current store size. Useful for testing. */
export function _getStoreSizeForTesting(): number {
  return store.size;
}
