/**
 * Configuration and types for in-memory LRU rate limiter.
 *
 * @module shared/rate-limit/memory-fallback-types
 */

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
