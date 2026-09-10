/**
 * In-Memory LRU Fallback for Rate Limiter
 *
 * Used when Redis is unreachable. Provides bounded, thread-safe
 * rate limiting with LRU eviction and TTL-aware cleanup.
 *
 * Max 10k entries. Evicts LRU (tail) when full.
 * Periodic cleanup removes expired entries every 30s.
 *
 * @module shared/rate-limit/memory-fallback
 */

import { logger } from '../utils/logger';
import { AsyncMutex, LRUCache } from './lru-cache';

// ─── Configuration ─────────────────────────────────────────────────────────────

export const MEMORY_FALLBACK_CONFIG: {
  readonly MAX_ENTRIES: number;
  readonly DEFAULT_WINDOW_MS: number;
  readonly DEFAULT_LIMIT: number;
  readonly CLEANUP_INTERVAL_MS: number;
} = {
  MAX_ENTRIES: 10_000,
  DEFAULT_WINDOW_MS: 60_000,
  DEFAULT_LIMIT: 10,
  CLEANUP_INTERVAL_MS: 30_000,
};

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MemoryRateLimitEntry {
  timestamps: number[];
  expiresAt: number;
  limit: number;
}

export interface MemoryRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  isFallback: boolean;
}

export interface MemoryRateLimitOptions {
  userId: string;
  limit?: number;
  windowMs?: number;
}

// ─── Memory Rate Limiter (LRU) ────────────────────────────────────────────────

export class MemoryRateLimiter {
  private readonly cache: LRUCache<MemoryRateLimitEntry>;
  private readonly mutex = new AsyncMutex();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly maxEntries: number = MEMORY_FALLBACK_CONFIG.MAX_ENTRIES) {
    this.cache = new LRUCache<MemoryRateLimitEntry>(maxEntries);
    this.startCleanup();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Check and record a rate limit hit for `userId`.
   * Returns whether the request is allowed, plus metadata.
   */
  async checkLimit(options: MemoryRateLimitOptions): Promise<MemoryRateLimitResult> {
    const key = `ratelimit:${options.userId}`;
    const now = Date.now();
    const windowMs = options.windowMs ?? MEMORY_FALLBACK_CONFIG.DEFAULT_WINDOW_MS;
    const limit = options.limit ?? MEMORY_FALLBACK_CONFIG.DEFAULT_LIMIT;

    return this.mutex.runExclusive(async () => {
      let node = this.cache.get(key);

      if (!node) {
        node = this.cache.set(key, { timestamps: [], expiresAt: now + windowMs, limit });
      } else {
        this.cache.moveToHead(node);
      }

      const entry = node.entry;

      // Evict timestamps outside the sliding window
      const valid = entry.timestamps.filter((ts: number) => ts > now - windowMs);
      entry.timestamps = valid;
      entry.expiresAt = now + windowMs;

      const count = valid.length;
      const allowed = count < limit;
      const remaining = Math.max(0, limit - count - (allowed ? 1 : 0));

      if (allowed) {
        entry.timestamps.push(now);
      }

      const retryAfterMs = allowed ? 0 : this.calcRetryAfter(valid, windowMs);

      return { allowed, remaining, retryAfterMs, isFallback: true };
    });
  }

  /** Get current count without consuming a slot. */
  async getCount(userId: string, windowMs?: number): Promise<number> {
    const key = `ratelimit:${userId}`;
    const now = Date.now();
    const w = windowMs ?? MEMORY_FALLBACK_CONFIG.DEFAULT_WINDOW_MS;

    return this.mutex.runExclusive(async () => {
      const node = this.cache.get(key);
      if (!node) return 0;

      const valid = node.entry.timestamps.filter((ts: number) => ts > now - w);
      node.entry.timestamps = valid;
      return valid.length;
    });
  }

  /** Reset rate limit for a user. */
  async reset(userId: string): Promise<void> {
    const key = `ratelimit:${userId}`;
    return this.mutex.runExclusive(async () => {
      this.cache.delete(key);
    });
  }

  /** Clear all entries (testing / shutdown). */
  async clearAll(): Promise<void> {
    return this.mutex.runExclusive(async () => {
      this.cache.clear();
    });
  }

  /** Get stats for monitoring dashboards. */
  getStats(): { entries: number; maxEntries: number; utilizationPercent: number } {
    return {
      entries: this.cache.size,
      maxEntries: this.maxEntries,
      utilizationPercent: Math.round((this.cache.size / this.maxEntries) * 100),
    };
  }

  /** Stop cleanup timer and clear state. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  private calcRetryAfter(timestamps: number[], windowMs: number): number {
    if (timestamps.length === 0) return 0;
    const oldest = Math.min(...timestamps);
    return Math.max(0, oldest + windowMs - Date.now());
  }

  // ─── Periodic Cleanup ────────────────────────────────────────────────────────

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, MEMORY_FALLBACK_CONFIG.CLEANUP_INTERVAL_MS);
  }

  private cleanupExpired(): void {
    const now = Date.now();

    this.mutex.runExclusive(async () => {
      const expired: string[] = [];
      for (const [key, node] of this.cache.entries()) {
        if (node.entry.expiresAt < now) expired.push(key);
      }

      for (const key of expired) {
        this.cache.delete(key);
      }

      if (expired.length > 0) {
        logger.debug('[MemoryRateLimiter] evicted expired entries', {
          evicted: expired.length,
          remaining: this.cache.size,
        });
      }
    }).catch((err: unknown) => {
      logger.error('[MemoryRateLimiter] cleanup error', {
        cause: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/** Singleton in-memory fallback limiter. */
export const memoryRateLimiter = new MemoryRateLimiter();
