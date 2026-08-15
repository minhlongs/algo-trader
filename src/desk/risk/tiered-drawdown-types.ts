/**
 * Tiered Drawdown Breaker types
 * Extracted from tiered-drawdown-breaker.ts for modularity
 */

export type DrawdownTier = 'NORMAL' | 'ALERT' | 'REDUCE' | 'HALT' | 'HARD_STOP' | 'DAILY_PAUSE';

export interface TieredDrawdownConfig {
  alertThreshold: number;
  reduceThreshold: number;
  haltThreshold: number;
  hardStopThreshold: number;
  dailyLossThreshold: number;
  haltDurationMs: number;
  dailyPauseDurationMs: number;
  alertSizingReduction: number;
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

/** Persisted shape for disk serialization */
export interface DrawdownPersistedState {
  highWaterMark: number;
  currentValue: number;
  tier: DrawdownTier;
  haltedUntil: number | null;
  dailyPausedUntil: number | null;
  dailyStartValue: number;
  dailyPnl: number;
  events: DrawdownEvent[];
}

export const DEFAULT_CONFIG: TieredDrawdownConfig = {
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
