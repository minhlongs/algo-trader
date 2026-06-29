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
   */
  register(signal: Signal): void {
    this.signals.set(signal.id, signal);

    const delay = signal.expiresAt - Date.now();
    if (delay <= 0) {
      // Already expired — keep visible in map this tick, evict via zero-delay timer
    this.evict(signal.id);
      return;
    }

    // Cancel any existing timer for this id
    const existing = this.timers.get(signal.id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => this.evict(signal.id), delay);
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
