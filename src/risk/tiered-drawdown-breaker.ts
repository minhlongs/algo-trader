/**
 * Tiered Drawdown Circuit Breaker
 * Portfolio-level tiered drawdown protection with high-water mark tracking.
 *
 * Tiers (from high-water mark):
 * -5%  → ALERT: reduce new position sizing by 25%
 * -10% → REDUCE: halve new positions + close weakest 25% of portfolio
 * -15% → HALT: stop new trading 48h + close 50% of positions
 * -20% → HARD_STOP: close everything, require manual restart
 *
 * Single-day loss >3% → pause new trades 24h
 */

import { logger } from '../utils/logger';
import { writeJsonState, cashclawPath } from '../persistence/file-store';
import * as fs from 'node:fs';

export type DrawdownTier = 'NORMAL' | 'ALERT' | 'REDUCE' | 'HALT' | 'HARD_STOP' | 'DAILY_PAUSE';

export interface TieredDrawdownConfig {
  /** Tier thresholds as fractions (0.05 = 5%) */
  alertThreshold: number;
  reduceThreshold: number;
  haltThreshold: number;
  hardStopThreshold: number;
  /** Single-day loss threshold */
  dailyLossThreshold: number;
  /** Halt duration in ms (default 48h) */
  haltDurationMs: number;
  /** Daily pause duration in ms (default 24h) */
  dailyPauseDurationMs: number;
  /** Position sizing reduction at ALERT tier (0.25 = reduce by 25%) */
  alertSizingReduction: number;
  /** Position sizing reduction at REDUCE tier (0.5 = halve) */
  reduceSizingReduction: number;
}

export interface TieredDrawdownState {
  highWaterMark: number;
  currentValue: number;
  drawdownPercent: number;
  tier: DrawdownTier;
  sizingMultiplier: number;
  haltedUntil: number | null;
  dailyPausedUntil: number | null;
  dailyStartValue: number;
  dailyPnl: number;
  events: DrawdownEvent[];
}

export interface DrawdownEvent {
  tier: DrawdownTier;
  drawdownPercent: number;
  portfolioValue: number;
  highWaterMark: number;
  timestamp: number;
  action: string;
}

export interface PositionWeakness {
  id: string;
  symbol: string;
  unrealizedPnl: number;
}

const DEFAULT_CONFIG: TieredDrawdownConfig = {
  alertThreshold: 0.05,
  reduceThreshold: 0.10,
  haltThreshold: 0.15,
  hardStopThreshold: 0.20,
  dailyLossThreshold: 0.03,
  haltDurationMs: 48 * 60 * 60 * 1000,
  dailyPauseDurationMs: 24 * 60 * 60 * 1000,
  alertSizingReduction: 0.25,
  reduceSizingReduction: 0.50,
};

/** Persisted shape: HWM, tier, halt timers — enough to restore after PM2 restart */
interface DrawdownPersistedState {
  highWaterMark: number;
  currentValue: number;
  tier: DrawdownTier;
  haltedUntil: number | null;
  dailyPausedUntil: number | null;
  dailyStartValue: number;
  dailyPnl: number;
  events: DrawdownEvent[];
}

export class TieredDrawdownBreaker {
  private config: TieredDrawdownConfig;
  private highWaterMark: number;
  private currentValue: number;
  private tier: DrawdownTier = 'NORMAL';
  private haltedUntil: number | null = null;
  private dailyPausedUntil: number | null = null;
  private dailyStartValue: number;
  private dailyPnl: number = 0;
  private events: DrawdownEvent[] = [];
  private onEvent?: (event: DrawdownEvent) => void;
  private readonly statePath: string;
  private activeWrite: Promise<void> = Promise.resolve();
  public writePromise: Promise<void> = Promise.resolve();

  constructor(
    initialPortfolioValue: number,
    config?: Partial<TieredDrawdownConfig>,
    onEvent?: (event: DrawdownEvent) => void,
    statePath?: string
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.highWaterMark = initialPortfolioValue;
    this.currentValue = initialPortfolioValue;
    this.dailyStartValue = initialPortfolioValue;
    this.onEvent = onEvent;
    this.statePath = statePath ?? cashclawPath('drawdown-state.json');
    this.loadState(initialPortfolioValue);
  }

  /** Update portfolio value and evaluate drawdown tiers */
  update(newValue: number): TieredDrawdownState {
    this.currentValue = newValue;

    // Update high-water mark
    if (newValue > this.highWaterMark) {
      this.highWaterMark = newValue;
    }

    // Calculate drawdown from HWM
    const drawdownPercent = this.highWaterMark > 0
      ? (this.highWaterMark - newValue) / this.highWaterMark
      : 0;

    // Update daily P&L
    this.dailyPnl = newValue - this.dailyStartValue;

    // Evaluate tiers (check highest severity first)
    const _previousTier = this.tier; // reserved for tier-change event emission

    if (drawdownPercent >= this.config.hardStopThreshold) {
      this.setTier('HARD_STOP', drawdownPercent, 'CLOSE ALL — manual restart required');
    } else if (drawdownPercent >= this.config.haltThreshold) {
      if (this.tier !== 'HALT' && this.tier !== 'HARD_STOP') {
        this.haltedUntil = Date.now() + this.config.haltDurationMs;
        this.setTier('HALT', drawdownPercent, `Trading halted 48h, close 50% of positions`);
      }
    } else if (drawdownPercent >= this.config.reduceThreshold) {
      this.setTier('REDUCE', drawdownPercent, 'Halve new positions, close weakest 25%');
    } else if (drawdownPercent >= this.config.alertThreshold) {
      this.setTier('ALERT', drawdownPercent, 'Reduce new position sizing by 25%');
    } else {
      this.tier = 'NORMAL';
    }

    // Check single-day loss
    const dailyLossPercent = this.dailyStartValue > 0
      ? Math.abs(Math.min(0, this.dailyPnl)) / this.dailyStartValue
      : 0;

    if (dailyLossPercent >= this.config.dailyLossThreshold && this.tier === 'NORMAL') {
      this.dailyPausedUntil = Date.now() + this.config.dailyPauseDurationMs;
      this.setTier('DAILY_PAUSE', dailyLossPercent, `Daily loss >${(this.config.dailyLossThreshold * 100).toFixed(0)}%, paused 24h`);
    }

    return this.getState();
  }

  /** Check if new trades are allowed */
  canOpenNewTrades(): boolean {
    const now = Date.now();

    if (this.tier === 'HARD_STOP') return false;
    if (this.tier === 'HALT' && this.haltedUntil && now < this.haltedUntil) return false;
    if (this.tier === 'DAILY_PAUSE' && this.dailyPausedUntil && now < this.dailyPausedUntil) return false;

    // Auto-resume after halt/pause expiry
    if (this.tier === 'HALT' && this.haltedUntil && now >= this.haltedUntil) {
      this.haltedUntil = null;
      this.tier = 'NORMAL';
    }
    if (this.tier === 'DAILY_PAUSE' && this.dailyPausedUntil && now >= this.dailyPausedUntil) {
      this.dailyPausedUntil = null;
      this.tier = 'NORMAL';
    }

    return true;
  }

  /** Get the position sizing multiplier for the current tier */
  getSizingMultiplier(): number {
    switch (this.tier) {
      case 'ALERT': return 1 - this.config.alertSizingReduction;       // 0.75
      case 'REDUCE': return 1 - this.config.reduceSizingReduction;     // 0.50
      case 'HALT': return 0;
      case 'HARD_STOP': return 0;
      case 'DAILY_PAUSE': return 0;
      default: return 1;
    }
  }

  /** Get positions to close based on current tier */
  getPositionsToClose(positions: PositionWeakness[]): string[] {
    if (positions.length === 0) return [];

    // Sort by unrealized P&L ascending (weakest first)
    const sorted = [...positions].sort((a, b) => a.unrealizedPnl - b.unrealizedPnl);

    switch (this.tier) {
      case 'REDUCE': {
        const count = Math.ceil(sorted.length * 0.25);
        return sorted.slice(0, count).map(p => p.id);
      }
      case 'HALT': {
        const count = Math.ceil(sorted.length * 0.50);
        return sorted.slice(0, count).map(p => p.id);
      }
      case 'HARD_STOP':
        return sorted.map(p => p.id);
      default:
        return [];
    }
  }

  /** Reset daily tracking (call at start of each trading day) */
  resetDaily(): void {
    this.dailyStartValue = this.currentValue;
    this.dailyPnl = 0;
    this.dailyPausedUntil = null;
    if (this.tier === 'DAILY_PAUSE') {
      this.tier = 'NORMAL';
    }
    this.saveState();
  }

  /** Manual restart after HARD_STOP (requires explicit action) */
  manualRestart(newPortfolioValue: number): void {
    this.highWaterMark = newPortfolioValue;
    this.currentValue = newPortfolioValue;
    this.dailyStartValue = newPortfolioValue;
    this.dailyPnl = 0;
    this.tier = 'NORMAL';
    this.haltedUntil = null;
    this.dailyPausedUntil = null;
    this.saveState();
    logger.info(`[TieredDrawdown] Manual restart at $${newPortfolioValue.toFixed(2)}`);
  }

  getState(): TieredDrawdownState {
    const drawdownPercent = this.highWaterMark > 0
      ? (this.highWaterMark - this.currentValue) / this.highWaterMark
      : 0;

    return {
      highWaterMark: this.highWaterMark,
      currentValue: this.currentValue,
      drawdownPercent,
      tier: this.tier,
      sizingMultiplier: this.getSizingMultiplier(),
      haltedUntil: this.haltedUntil,
      dailyPausedUntil: this.dailyPausedUntil,
      dailyStartValue: this.dailyStartValue,
      dailyPnl: this.dailyPnl,
      events: [...this.events],
    };
  }

  getEvents(): DrawdownEvent[] {
    return [...this.events];
  }

  private setTier(tier: DrawdownTier, drawdownPercent: number, action: string): void {
    if (this.tier === tier) return; // Don't re-trigger same tier

    this.tier = tier;
    const event: DrawdownEvent = {
      tier,
      drawdownPercent,
      portfolioValue: this.currentValue,
      highWaterMark: this.highWaterMark,
      timestamp: Date.now(),
      action,
    };

    this.events.push(event);
    if (this.events.length > 100) this.events.shift();

    this.saveState();
    logger.warn(`[TieredDrawdown] ${tier}: ${action} (drawdown ${(drawdownPercent * 100).toFixed(2)}%, portfolio $${this.currentValue.toFixed(2)})`);

    if (this.onEvent) {
      this.onEvent(event);
    }
  }

  private writeScheduled = false;
  private saveDeferredResolve: (() => void)[] = [];
  private saveDeferredReject: ((err: any) => void)[] = [];

  private saveState(): void {
    if (this.writeScheduled) {
      return;
    }
    this.writeScheduled = true;

    const nextWrite = new Promise<void>((resolve, reject) => {
      this.saveDeferredResolve.push(resolve);
      this.saveDeferredReject.push(reject);
    });

    this.writePromise = this.activeWrite.then(() => nextWrite);

    setTimeout(async () => {
      this.writeScheduled = false;
      const resolves = this.saveDeferredResolve;
      const rejects = this.saveDeferredReject;
      this.saveDeferredResolve = [];
      this.saveDeferredReject = [];

      const state: DrawdownPersistedState = {
        highWaterMark: this.highWaterMark,
        currentValue: this.currentValue,
        tier: this.tier,
        haltedUntil: this.haltedUntil,
        dailyPausedUntil: this.dailyPausedUntil,
        dailyStartValue: this.dailyStartValue,
        dailyPnl: this.dailyPnl,
        events: this.events,
      };

      try {
        await writeJsonState(this.statePath, state);
        resolves.forEach(r => r());
      } catch (err) {
        logger.error('[TieredDrawdown] Failed to save state to disk:', err);
        rejects.forEach(r => r(err));
      }
    }, 50);
  }

  private loadState(initialPortfolioValue: number): void {
    try {
      if (!fs.existsSync(this.statePath)) return;
      const content = fs.readFileSync(this.statePath, 'utf8');
      const state = JSON.parse(content) as DrawdownPersistedState;
      if (!state) return;
      // Restore critical fields; keep initialPortfolioValue as fallback for currentValue
      this.highWaterMark = state.highWaterMark;
      this.currentValue = state.currentValue ?? initialPortfolioValue;
      this.tier = state.tier ?? 'NORMAL';
      this.haltedUntil = state.haltedUntil;
      this.dailyPausedUntil = state.dailyPausedUntil;
      this.dailyStartValue = state.dailyStartValue ?? initialPortfolioValue;
      this.dailyPnl = state.dailyPnl ?? 0;
      this.events = state.events ?? [];
      logger.info(`[TieredDrawdown] Restored state from disk: tier=${this.tier}, HWM=$${this.highWaterMark.toFixed(2)}`);
    } catch (err) {
      logger.warn('[TieredDrawdown] No existing state file found or failed to parse:', err);
    }
  }
}
