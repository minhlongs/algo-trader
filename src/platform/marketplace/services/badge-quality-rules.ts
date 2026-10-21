/**
 * Badge Quality Rules
 *
 * Pure threshold decisions that award a listing a quality badge. Kept separate
 * from persistence and batch orchestration so each badge's cutoff is a single
 * named constant that can be reviewed on its own.
 */

import type { BadgeKey } from './badge-service';

/** Data one listing's badge decision depends on. */
export interface BadgeRuleInput {
  /** Days since the listing was created. */
  createdAge: number;
  perfs: Array<{
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
    totalPnlUsd: number;
  }>;
  /** Sharpe percentile rank (0 = best) when the latest run had one. */
  sharpePercentile?: number;
  isApproved: boolean;
  hasVettedAt: boolean;
}

/** A listing is "new" for this many days after creation. */
const NEW_STRATEGY_MAX_AGE_DAYS = 30;

/** Sharpe percentile at or below which a listing is a top performer. */
const TOP_PERFORMER_PERCENTILE = 0.1;

/** Max drawdown (percent) a listing may carry and still count as low risk. */
const LOW_RISK_MAX_DRAWDOWN = 10;

/** Minimum trades across the evaluated period for a high-volume badge. */
const HIGH_VOLUME_MIN_TRADES = 1000;

/** Periods with positive P&L needed (as a share of evaluated periods). */
const CONSISTENT_RETURNS_POSITIVE_SHARE = 0.7;

/** Minimum evaluated periods before consistency is meaningful. */
const CONSISTENT_RETURNS_MIN_PERIODS = 3;

/**
 * Decide which quality badges a listing earns.
 *
 * Ordering is stable so the persisted badge array is reproducible.
 */
export function evaluateBadgeRules(input: BadgeRuleInput): BadgeKey[] {
  const badges: BadgeKey[] = [];

  if (input.createdAge <= NEW_STRATEGY_MAX_AGE_DAYS) {
    badges.push('new_strategy');
  }

  const perfs = input.perfs;
  if (perfs.length > 0) {
    const latest = perfs[0];
    const totalTrades = perfs.reduce((s, p) => s + p.totalTrades, 0);
    const positivePeriods = perfs.filter((p) => p.totalPnlUsd > 0).length;

    if (latest.sharpeRatio > 0 && input.sharpePercentile !== undefined &&
        input.sharpePercentile <= TOP_PERFORMER_PERCENTILE) {
      badges.push('top_performer');
    }

    if (latest.maxDrawdown > 0 && latest.maxDrawdown < LOW_RISK_MAX_DRAWDOWN) {
      badges.push('low_risk');
    }

    if (totalTrades >= HIGH_VOLUME_MIN_TRADES) {
      badges.push('high_volume');
    }

    if (perfs.length >= CONSISTENT_RETURNS_MIN_PERIODS &&
        positivePeriods / perfs.length >= CONSISTENT_RETURNS_POSITIVE_SHARE) {
      badges.push('consistent_returns');
    }
  }

  if (input.isApproved && input.hasVettedAt) {
    badges.push('verified_creator');
  }

  return badges;
}
