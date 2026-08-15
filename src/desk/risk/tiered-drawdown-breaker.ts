/**
 * Tiered Drawdown Circuit Breaker
 * Portfolio-level tiered drawdown protection with high-water mark tracking.
 *
 * Tiers (from high-water mark):
 * -5%  → ALERT: reduce new position sizing by 25%
 * -10% → REDUCE: halve new positions + close weakest 25%
 * -15% → HALT: stop new trading 48h + close 50%
 * -20% → HARD_STOP: close everything, require manual restart
 */

import { logger } from '../utils/logger';
import type { TieredDrawdownConfig, TieredDrawdownState, DrawdownTier, DrawdownEvent } from './tiered-drawdown-types';
import { DEFAULT_CONFIG } from './tiered-drawdown-types';
import { buildPersistedState, scheduleDeferredWrite, loadPersistedState } from './tiered-drawdown-persistence';

// Re-export types for backward compatibility
export type { TieredDrawdownConfig, TieredDrawdownState, DrawdownTier, DrawdownEvent } from './tiered-drawdown-types';

interface DeferredWrite { data: ReturnType<typeof buildPersistedState>; timer: ReturnType<typeof setTimeout> | null; }

export class TieredDrawdownBreaker {
  private config: TieredDrawdownConfig;
  private highWaterMark: number;
  private currentValue: number;
  private tier: DrawdownTier = 'NORMAL';
  private haltedUntil: number | null = null;
  private dailyPausedUntil: number | null = null;
  private dailyStartValue: number;
  private dailyPnl = 0;
  private events: DrawdownEvent[] = [];
  private writeQueue: DeferredWrite = { data: {} as ReturnType<typeof buildPersistedState>, timer: null };

  constructor(initialPortfolioValue: number, config?: Partial<TieredDrawdownConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.highWaterMark = initialPortfolioValue;
    this.currentValue = initialPortfolioValue;
    this.dailyStartValue = initialPortfolioValue;
    this.loadFromDisk();
  }

  /** Record a portfolio value change and evaluate tier transitions */
  update(newValue: number): TieredDrawdownState {
    this.currentValue = newValue;
    if (newValue > this.highWaterMark) this.highWaterMark = newValue;
    this.dailyPnl = newValue - this.dailyStartValue;

    const prevTier = this.tier;
    const wasPaused = this.tier === 'DAILY_PAUSE' || this.tier === 'HALT';
    const now = Date.now();
    
    // Check daily pause
    if (this.dailyPausedUntil && now < this.dailyPausedUntil) {
      this.tier = 'DAILY_PAUSE';
    } else if (this.haltedUntil && now < this.haltedUntil) {
      this.tier = 'HALT';
    } else if (wasPaused) {
      // Pause/halt window expired — clear timers and re-evaluate at a lower tier
      // (resuming=true prevents re-entry at the same HALT threshold)
      this.haltedUntil = null;
      this.dailyPausedUntil = null;
      this.evaluateTier(prevTier, true);
      this.saveToDisk();
      return this.getState();
    } else {
      this.evaluateTier(prevTier);
    }

    this.saveToDisk();
    return this.getState();
  }

  private evaluateTier(prevTier: DrawdownTier, resuming = false): void {
    const dd = this.highWaterMark > 0 ? (this.highWaterMark - this.currentValue) / this.highWaterMark : 0;
    const now = Date.now();
    // When resuming from a pause, use strict > for HALT to avoid immediate re-entry
    // at the same threshold — step down to REDUCE instead
    const haltCmp = resuming ? dd > this.config.haltThreshold : dd >= this.config.haltThreshold;
    if (dd >= this.config.hardStopThreshold) this.tier = 'HARD_STOP';
    else if (haltCmp) { this.tier = 'HALT'; this.haltedUntil = now + this.config.haltDurationMs; }
    else if (dd >= this.config.reduceThreshold) this.tier = 'REDUCE';
    else if (dd >= this.config.alertThreshold) this.tier = 'ALERT';
    else this.tier = 'NORMAL';

    // Daily loss check
    if (this.tier === 'NORMAL' && this.highWaterMark > 0) {
      const dailyDd = (this.dailyStartValue - this.currentValue) / this.dailyStartValue;
      if (dailyDd >= this.config.dailyLossThreshold) {
        this.tier = 'DAILY_PAUSE';
        this.dailyPausedUntil = Date.now() + this.config.dailyPauseDurationMs;
      }
    }

    if (prevTier !== this.tier) {
      const event: DrawdownEvent = { tier: this.tier, drawdownPercent: dd * 100, portfolioValue: this.currentValue, highWaterMark: this.highWaterMark, timestamp: Date.now(), action: `Tier changed ${prevTier} → ${this.tier}` };
      this.events.push(event);
      logger.warn(`[TieredDrawdown] ${event.action} (${dd.toFixed(2)}%)`);
    }
  }

  /** Check if new trades are allowed */
  canOpenNewTrades(): boolean { return this.tier === 'NORMAL' || this.tier === 'ALERT'; }

  /** Get sizing multiplier (1.0 = full size, 0.5 = half size) */
  getSizingMultiplier(): number {
    if (this.tier === 'HARD_STOP' || this.tier === 'HALT') return 0;
    if (this.tier === 'REDUCE') return 1 - this.config.reduceSizingReduction;
    if (this.tier === 'ALERT') return 1 - this.config.alertSizingReduction;
    return 1.0;
  }

  /** Get fraction of portfolio positions to close (0 = none, 0.5 = half) */
  getPositionsToCloseFraction(): number {
    if (this.tier === 'HARD_STOP') return 1.0;
    if (this.tier === 'HALT') return 0.5;
    if (this.tier === 'REDUCE') return 0.25;
    return 0;
  }

  /** Reset to NORMAL (manual override after hard stop) */
  reset(newPortfolioValue: number): void {
    this.highWaterMark = newPortfolioValue;
    this.currentValue = newPortfolioValue;
    this.tier = 'NORMAL';
    this.haltedUntil = null;
    this.dailyPausedUntil = null;
    this.dailyStartValue = newPortfolioValue;
    this.dailyPnl = 0;
    this.events = [];
    this.saveToDisk();
    logger.info('[TieredDrawdown] Reset to NORMAL');
  }

  getState(): TieredDrawdownState {
    const dd = this.highWaterMark > 0 ? (this.highWaterMark - this.currentValue) / this.highWaterMark : 0;
    return { highWaterMark: this.highWaterMark, currentValue: this.currentValue, drawdownPercent: dd * 100, tier: this.tier, sizingMultiplier: this.getSizingMultiplier(), haltedUntil: this.haltedUntil, dailyPausedUntil: this.dailyPausedUntil, dailyStartValue: this.dailyStartValue, dailyPnl: this.dailyPnl, events: [...this.events] };
  }

  private saveToDisk(): void {
    this.writeQueue.data = buildPersistedState(this.highWaterMark, this.currentValue, this.tier, this.haltedUntil, this.dailyPausedUntil, this.dailyStartValue, this.dailyPnl, this.events);
    scheduleDeferredWrite(this.writeQueue, this.writeQueue.data);
  }

  private loadFromDisk(): void {
    const state = loadPersistedState();
    if (!state) return;
    this.highWaterMark = state.highWaterMark;
    this.currentValue = state.currentValue ?? this.currentValue;
    this.tier = state.tier ?? 'NORMAL';
    this.haltedUntil = state.haltedUntil;
    this.dailyPausedUntil = state.dailyPausedUntil;
    this.dailyStartValue = state.dailyStartValue ?? this.dailyStartValue;
    this.dailyPnl = state.dailyPnl ?? 0;
    this.events = state.events ?? [];
    logger.info(`[TieredDrawdown] Restored state from disk: tier=${this.tier}, HWM=$${this.highWaterMark.toFixed(2)}`);
  }
}
