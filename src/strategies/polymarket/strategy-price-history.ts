/**
 * Shared price history & state management for Polymarket strategies.
 * Provides per-market tick tracking, cooldown management, and position lookups.
 * Eliminates ~40 lines of duplicated state code per strategy file.
 */

import type { PriceTick } from './strategy-shared-types.js';

/** Manages per-market price tick history with automatic pruning. */
export class PriceHistoryTracker {
  private history = new Map<string, PriceTick[]>();
  private maxTicks: number;

  constructor(maxTicks: number) {
    this.maxTicks = maxTicks;
  }

  /** Record a new price tick for a token. Auto-prunes to maxTicks. */
  record(tokenId: string, price: number): void {
    let ticks = this.history.get(tokenId);
    if (!ticks) {
      ticks = [];
      this.history.set(tokenId, ticks);
    }
    ticks.push({ price, timestamp: Date.now() });
    if (ticks.length > this.maxTicks) {
      ticks.splice(0, ticks.length - this.maxTicks);
    }
  }

  /** Get last N prices for a token. Returns empty array if not enough data. */
  getPrices(tokenId: string, count: number): number[] {
    const ticks = this.history.get(tokenId);
    if (!ticks) return [];
    return ticks.slice(-count).map(t => t.price);
  }

  /** Get all recorded ticks for a token. */
  getTicks(tokenId: string): PriceTick[] {
    return this.history.get(tokenId) ?? [];
  }

  /** Number of tracked markets. */
  get size(): number {
    return this.history.size;
  }
}

/** Manages per-market cooldown timers. */
export class CooldownTracker {
  private cooldowns = new Map<string, number>();

  /** Set cooldown for a token ID. */
  set(tokenId: string, durationMs: number): void {
    this.cooldowns.set(tokenId, Date.now() + durationMs);
  }

  /** Check if a token is currently in cooldown. */
  isActive(tokenId: string): boolean {
    const until = this.cooldowns.get(tokenId) ?? 0;
    return Date.now() < until;
  }
}

/** Check if any position in the array matches the given token ID. */
export function hasPositionForToken<T extends { tokenId: string }>(
  positions: T[],
  tokenId: string,
): boolean {
  return positions.some(p => p.tokenId === tokenId);
}
