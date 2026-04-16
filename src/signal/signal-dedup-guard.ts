/**
 * Signal Dedup Guard
 * Rejects duplicate signal IDs within their TTL window.
 * Uses in-memory Set + expiry map; D1 UNIQUE constraint is the hard stop.
 */

import { createHash } from 'crypto';
import type { Signal } from './signal-types';

interface ExpiryEntry {
  expiresAt: number;
}

export class SignalDedupGuard {
  /** signalId → expiry timestamp ms */
  private seen: Map<string, ExpiryEntry> = new Map();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60_000) {
    // Periodically evict expired entries to keep memory bounded
    this.cleanupIntervalId = setInterval(() => this.evictExpired(), cleanupIntervalMs);
  }

  /**
   * Build canonical signal ID: sha256(strategy+market+side+bucketTs)
   * bucketTs = floor(ts / ttl*1000) * ttl*1000 — deduplicates within same TTL bucket
   */
  static buildId(strategy: string, market: string, side: string, ts: number, ttlSec: number): string {
    const bucketMs = ttlSec * 1000;
    const bucketTs = Math.floor(ts / bucketMs) * bucketMs;
    const raw = `${strategy}|${market}|${side}|${bucketTs}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  /**
   * Returns true if this signal is a duplicate (already seen and not expired).
   * If not a duplicate, registers it.
   */
  isDuplicate(signal: Signal): boolean {
    const entry = this.seen.get(signal.id);
    const now = Date.now();

    if (entry && entry.expiresAt > now) {
      return true;
    }

    this.seen.set(signal.id, { expiresAt: signal.expiresAt });
    return false;
  }

  /** Evict expired signal IDs from memory */
  evictExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.seen.entries()) {
      if (entry.expiresAt <= now) {
        this.seen.delete(id);
      }
    }
  }

  /** Stop background cleanup (call on shutdown) */
  destroy(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /** Visible for tests */
  get size(): number {
    return this.seen.size;
  }
}

export const signalDedupGuard = new SignalDedupGuard();
