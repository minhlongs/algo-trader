/**
 * Tier evaluation logic for Tiered Drawdown Circuit Breaker.
 *
 * @module desk/risk/tiered-drawdown-evaluator
 */

import { logger } from '../utils/logger';
import type {
  TieredDrawdownConfig,
  DrawdownTier,
  DrawdownEvent,
} from './tiered-drawdown-types';

export interface EvaluatorParams {
  highWaterMark: number;
  currentValue: number;
  dailyStartValue: number;
  config: TieredDrawdownConfig;
  prevTier: DrawdownTier;
  resuming?: boolean;
}

export interface EvaluatorResult {
  tier: DrawdownTier;
  haltedUntil: number | null;
  dailyPausedUntil: number | null;
  event: DrawdownEvent | null;
}

export function evaluateDrawdownTier(params: EvaluatorParams): EvaluatorResult {
  const { highWaterMark, currentValue, dailyStartValue, config, prevTier, resuming = false } = params;
  const dd = highWaterMark > 0 ? (highWaterMark - currentValue) / highWaterMark : 0;
  const now = Date.now();
  let tier: DrawdownTier = 'NORMAL';
  let haltedUntil: number | null = null;
  let dailyPausedUntil: number | null = null;

  const haltCmp = resuming ? dd > config.haltThreshold : dd >= config.haltThreshold;
  if (dd >= config.hardStopThreshold) {
    tier = 'HARD_STOP';
  } else if (haltCmp) {
    tier = 'HALT';
    haltedUntil = now + config.haltDurationMs;
  } else if (dd >= config.reduceThreshold) {
    tier = 'REDUCE';
  } else if (dd >= config.alertThreshold) {
    tier = 'ALERT';
  } else {
    tier = 'NORMAL';
  }

  // Daily loss check
  if (tier === 'NORMAL' && highWaterMark > 0) {
    const dailyDd = (dailyStartValue - currentValue) / dailyStartValue;
    if (dailyDd >= config.dailyLossThreshold) {
      tier = 'DAILY_PAUSE';
      dailyPausedUntil = Date.now() + config.dailyPauseDurationMs;
    }
  }

  let event: DrawdownEvent | null = null;
  if (prevTier !== tier) {
    event = {
      tier,
      drawdownPercent: dd * 100,
      portfolioValue: currentValue,
      highWaterMark,
      timestamp: Date.now(),
      action: `Tier changed ${prevTier} → ${tier}`,
    };
    logger.warn(`[TieredDrawdown] ${event.action} (${dd.toFixed(2)}%)`);
  }

  return { tier, haltedUntil, dailyPausedUntil, event };
}
