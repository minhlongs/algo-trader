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
import {
  evaluateDrawdownTier,
  resolveTierUpdate,
  computeSizingMultiplier,
  computePositionsToCloseFraction,
} from './tiered-drawdown-evaluator';

export type { TieredDrawdownConfig, TieredDrawdownState, DrawdownTier, DrawdownEvent } from './tiered-drawdown-types';
export { evaluateDrawdownTier, resolveTierUpdate, computeSizingMultiplier, computePositionsToCloseFraction };

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
    if (!Number.isFinite(newValue) || newValue < 0) {
      logger.warn(`[TieredDrawdown] Invalid portfolio value received: ${newValue}, ignoring`);
      return this.getState();
    }

    this.currentValue = newValue;
    if (newValue > this.highWaterMark) this.highWaterMark = newValue;
    this.dailyPnl = newValue - this.dailyStartValue;

    if (this.tier === 'HARD_STOP') {
      this.saveToDisk();
      return this.getState();
    }

    const result = resolveTierUpdate({
      highWaterMark: this.highWaterMark,
      currentValue: this.currentValue,
      dailyStartValue: this.dailyStartValue,
      config: this.config,
      prevTier: this.tier,
      haltedUntil: this.haltedUntil,
      dailyPausedUntil: this.dailyPausedUntil,
    });

    this.tier = result.tier;
    this.haltedUntil = result.haltedUntil;
    this.dailyPausedUntil = result.dailyPausedUntil;
    if (result.event) this.events.push(result.event);

    this.saveToDisk();
    return this.getState();
  }

  canOpenNewTrades(): boolean { return this.tier === 'NORMAL' || this.tier === 'ALERT'; }

  getSizingMultiplier(): number { return computeSizingMultiplier(this.tier, this.config); }

  getPositionsToCloseFraction(): number { return computePositionsToCloseFraction(this.tier); }

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
    return {
      highWaterMark: this.highWaterMark, currentValue: this.currentValue, drawdownPercent: dd * 100,
      tier: this.tier, sizingMultiplier: this.getSizingMultiplier(), haltedUntil: this.haltedUntil,
      dailyPausedUntil: this.dailyPausedUntil, dailyStartValue: this.dailyStartValue,
      dailyPnl: this.dailyPnl, events: [...this.events],
    };
  }

  private shouldPersist(): boolean {
    if (this.config.persistState !== undefined) return this.config.persistState;
    return !process.env.VITEST;
  }

  private saveToDisk(): void {
    if (!this.shouldPersist()) return;
    this.writeQueue.data = buildPersistedState(
      this.highWaterMark, this.currentValue, this.tier, this.haltedUntil,
      this.dailyPausedUntil, this.dailyStartValue, this.dailyPnl, this.events,
    );
    scheduleDeferredWrite(this.writeQueue, this.writeQueue.data);
  }

  private loadFromDisk(): void {
    if (!this.shouldPersist()) return;
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
