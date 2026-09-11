/**
 * Sentiment Momentum Strategy Helpers and Configuration
 * Math and volume confirmation helpers for trend strength detection.
 */
import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SentimentMomentumConfig extends BaseStrategyConfig {
  /** Period (ticks) for trend strength calculation */
  adxPeriod: number;
  /** Minimum trend-strength score to confirm a strong trend (0-100) */
  adxThreshold: number;
  /** Lookback (ticks) for volume confirmation comparison */
  volumeLookback: number;
  /** Minimum ticks before entry */
  minTicks: number;
}

export const DEFAULT_CONFIG: SentimentMomentumConfig = {
  adxPeriod: 10,
  adxThreshold: 25,
  volumeLookback: 5,
  minTicks: 15,
  minVolume: 0,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '18',
};

export const STRATEGY_NAME: StrategyName = 'sentiment-momentum';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Simplified ADX-like trend strength (0-100).
 *
 * Uses price changes over `period` ticks. +DI / -DI capture directional bias;
 * ADX = 100 * |+DI - -DI| / (+DI + -DI) measures trend intensity regardless of
 * direction. Values above `adxThreshold` indicate a strong trend.
 */
export function calcTrendStrength(prices: number[], period: number): number {
  if (prices.length < period * 2) return 0;

  // Directional movement over the recent period
  let posSum = 0;
  let negSum = 0;
  let totalSum = 0;

  for (let i = prices.length - period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const absChange = Math.abs(change);
    totalSum += absChange;
    posSum += Math.max(change, 0);
    negSum += Math.max(-change, 0);
  }

  if (totalSum === 0) return 0;

  const plusDI = (posSum / totalSum) * 100;
  const minusDI = (negSum / totalSum) * 100;
  const sumDI = plusDI + minusDI;

  if (sumDI === 0) return 0;
  return (Math.abs(plusDI - minusDI) / sumDI) * 100;
}

/** Direction: 'yes' if +DI > -DI, 'no' if -DI > +DI, null if unclear. */
export function calcDirection(prices: number[], period: number): 'yes' | 'no' | null {
  if (prices.length < period * 2) return null;

  let posSum = 0;
  let negSum = 0;

  for (let i = prices.length - period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    posSum += Math.max(change, 0);
    negSum += Math.max(-change, 0);
  }

  if (posSum > negSum) return 'yes';
  if (negSum > posSum) return 'no';
  return null;
}

/**
 * Volume confirmation: compare recent average volume delta to prior period.
 * Returns true when recent volume exceeds the prior period, confirming trend
 * strength.
 */
export function detectVolumeConfirmation(volumes: number[], lookback: number): boolean {
  if (volumes.length < lookback * 2) return true; // not enough data — pass through

  const recent = volumes.slice(-lookback);
  const prior = volumes.slice(-lookback * 2, -lookback);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / lookback;
  const priorAvg = prior.reduce((s, v) => s + v, 0) / lookback;

  return recentAvg >= priorAvg;
}
