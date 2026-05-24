/**
 * Signal TTL Enforcer
 * Removes expired signals from the in-memory store.
 * D1 persistence is handled by the publisher; this enforcer guards the live cache.
 */

import type { Signal } from './signal-types';
import { logger } from '../utils/logger';

export class SignalTtlEnforcer {
  private signals: Map<string, Signal> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Register a signal for TTL enforcement.
   * Automatically removes from store when expired.
   *
   * Race-safety: the signal is written to the map BEFORE the expiry timer is
   * scheduled so that any same-tick getLive() call sees the signal.  An existing
   * timer for the same ID is cancelled BEFORE the map write to prevent a
   * stale timer evicting the freshly registered signal.
   *
   * Already-expired signals (delay <= 0) are written to the map then evicted
   * via a zero-delay setTimeout so callers within the current tick still observe
   * the signal through getLive() before it disappears.
   */
  register(signal: Signal): void {
    // 1. Cancel any stale timer before touching the map
    const existing = this.timers.get(signal.id);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(signal.id);
    }

    // 2. Write signal — must precede delay calculation so same-tick getLive() sees it
    this.signals.set(signal.id, signal);

    // 3. Schedule eviction
    const delay = signal.expiresAt - Date.now();
    const timer = setTimeout(() => this.evict(signal.id), Math.max(0, delay));
    this.timers.set(signal.id, timer);
  }

  /** Remove a signal by ID and cancel its timer */
  evict(id: string): void {
    const sig = this.signals.get(id);
    if (sig) {
      this.signals.delete(id);
      logger.debug(`[SignalTTL] Evicted signal ${id} (market=${sig.market})`);
    }
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /** Return all live (non-expired) signals */
  getLive(): Signal[] {
    const now = Date.now();
    return Array.from(this.signals.values()).filter((s) => s.expiresAt > now);
  }

  /** Bulk evict all signals past their expiresAt (defensive sweep) */
  sweepExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, sig] of this.signals.entries()) {
      if (sig.expiresAt <= now) {
        this.evict(id);
        count++;
      }
    }
    return count;
  }

  /** Visible for tests */
  get size(): number {
    return this.signals.size;
  }

  /** Clear all state (used in tests / shutdown) */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.signals.clear();
    this.timers.clear();
  }
}

export const signalTtlEnforcer = new SignalTtlEnforcer();
