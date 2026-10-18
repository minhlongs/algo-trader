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
  let dailyPausedUntil: number | null;
  dailyPausedUntil = null;

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

export function resolveTierUpdate(
  params: EvaluatorParams & { haltedUntil: number | null; dailyPausedUntil: number | null },
): EvaluatorResult {
  const { highWaterMark, currentValue, config, prevTier } = params;
  let { haltedUntil, dailyPausedUntil } = params;
  const wasPaused = prevTier === 'DAILY_PAUSE' || prevTier === 'HALT';
  const now = Date.now();
  const dd = highWaterMark > 0 ? (highWaterMark - currentValue) / highWaterMark : 0;

  const applyEval = (resuming = false): EvaluatorResult => {
    const res = evaluateDrawdownTier({ ...params, resuming });
    return {
      tier: res.tier,
      haltedUntil: res.haltedUntil !== null ? res.haltedUntil : haltedUntil,
      dailyPausedUntil: res.dailyPausedUntil !== null ? res.dailyPausedUntil : dailyPausedUntil,
      event: res.event,
    };
  };

  if (dd >= config.hardStopThreshold) {
    haltedUntil = null;
    dailyPausedUntil = null;
    return applyEval(false);
  }
  if (dailyPausedUntil && now < dailyPausedUntil) {
    if (dd >= config.haltThreshold || dd >= config.reduceThreshold) {
      dailyPausedUntil = null;
      return applyEval(false);
    }
    return { tier: 'DAILY_PAUSE', haltedUntil, dailyPausedUntil, event: null };
  }
  if (haltedUntil && now < haltedUntil) {
    return { tier: 'HALT', haltedUntil, dailyPausedUntil, event: null };
  }
  if (wasPaused) {
    haltedUntil = null;
    dailyPausedUntil = null;
    return applyEval(true);
  }
  return applyEval(false);
}

export function computeSizingMultiplier(tier: DrawdownTier, config: TieredDrawdownConfig): number {
  if (tier === 'HARD_STOP' || tier === 'HALT') return 0;
  if (tier === 'REDUCE') return 1 - config.reduceSizingReduction;
  if (tier === 'ALERT') return 1 - config.alertSizingReduction;
  return 1.0;
}

export function computePositionsToCloseFraction(tier: DrawdownTier): number {
  if (tier === 'HARD_STOP') return 1.0;
  if (tier === 'HALT') return 0.5;
  if (tier === 'REDUCE') return 0.25;
  return 0;
}
