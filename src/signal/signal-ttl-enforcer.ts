/**
 * Signal TTL Enforcer
 * Removes expired signals from the in-memory store.
 * D1 persistence is handled by the publisher; this enforcer guards the live cache.
 */

import type { Signal } from './signal-types';
import { logger } from '../shared/utils/logger';

export const MAX_SIGNALS = 10_000;
export const SWEEP_INTERVAL_MS = 1_000;

export class SignalTtlEnforcer {
  private signals: Map<string, Signal> = new Map();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(sweepIntervalMs: number = SWEEP_INTERVAL_MS) {
    this.sweepInterval = setInterval(() => {
      this.sweepExpired();
    }, sweepIntervalMs);
    if (this.sweepInterval && typeof this.sweepInterval.unref === 'function') {
      this.sweepInterval.unref();
    }
  }

  /**
   * Register a signal for TTL enforcement.
   * Enforces FIFO bounded capacity (10,000 signals max).
   */
  register(signal: Signal): void {
    if (this.signals.size >= MAX_SIGNALS && !this.signals.has(signal.id)) {
      const oldestKey = this.signals.keys().next().value;
      if (oldestKey !== undefined) {
        this.signals.delete(oldestKey);
      }
    }
    this.signals.set(signal.id, signal);
  }

  /** Remove a signal by ID */
  evict(id: string): void {
    const sig = this.signals.get(id);
    if (sig) {
      this.signals.delete(id);
      logger.debug(`[SignalTTL] Evicted signal ${id} (market=${sig.market})`);
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

  /** Stop background sweep interval */
  stop(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  /** Clear all state (used in tests / shutdown) */
  clear(): void {
    this.signals.clear();
  }
}

export const signalTtlEnforcer = new SignalTtlEnforcer();
