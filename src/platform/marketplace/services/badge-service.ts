/**
 * Listing Quality Badge Service
 * Computes quality badges for marketplace strategy listings based on
 * performance data, listing age, and vetting status.
 *
 * Badge types:
 *   verified_creator    — identity verified (vetted + approved)
 *   top_performer       — top 10% by Sharpe ratio over 90 days
 *   low_risk            — max drawdown < 10%
 *   high_volume         — 1000+ trades in evaluation period
 *   consistent_returns  — positive P&L in 70%+ of periods
 *   new_strategy        — listed within last 30 days
 */
import { logger } from '../../../shared/utils/logger';
import { getDbClient } from '../../../shared/db/postgres-client';
import {
  getSharpePercentile,
  persistListingBadges,
  fetchAllListingsForBadging,
  fetchStrategyData,
  fetchBadgeDefinitions,
  fetchListingBadgeKeys,
} from './badge-repository';

export type BadgeKey =
  | 'verified_creator'
  | 'top_performer'
  | 'low_risk'
  | 'high_volume'
  | 'consistent_returns'
  | 'new_strategy';

export interface BadgeDefinition {
  key: BadgeKey;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
}

export interface ListingBadges {
  listingId: string;
  strategyId: string;
  badges: BadgeDefinition[];
}

/**
 * Compute badges for a single listing based on strategy and performance data.
 */
export async function computeListingBadges(
  listingId: string,
  strategyId: string,
): Promise<BadgeKey[]> {
  const badges: BadgeKey[] = [];
  const data = await fetchStrategyData(strategyId);
  const perfs = data.perfs;

  // new_strategy: listed within last 30 days
  if (data.createdAge <= 30) {
    badges.push('new_strategy');
  }

  if (perfs.length > 0) {
    const latest = perfs[0];
    const totalTrades = perfs.reduce((s, p) => s + p.totalTrades, 0);
    const positivePeriods = perfs.filter((p) => p.totalPnlUsd > 0).length;

    // top_performer: top 10% by Sharpe among approved strategies
    if (latest.sharpeRatio > 0) {
      const rank = await getSharpePercentile(strategyId, latest.sharpeRatio);
      if (rank <= 0.1) badges.push('top_performer');
    }

    // low_risk: max drawdown under 10%
    if (latest.maxDrawdown > 0 && latest.maxDrawdown < 10) {
      badges.push('low_risk');
    }

    // high_volume: 1000+ trades
    if (totalTrades >= 1000) {
      badges.push('high_volume');
    }

    // consistent_returns: positive P&L in 70%+ of periods
    if (perfs.length >= 3 && positivePeriods / perfs.length >= 0.7) {
      badges.push('consistent_returns');
    }
  }

  // verified_creator: vetted by admin and approved
  if (data.isApproved && data.hasVettedAt) {
    badges.push('verified_creator');
  }

  return badges;
}

/**
 * Compute badges and persist them to the listing record.
 */
export async function refreshListingBadges(
  listingId: string,
  strategyId: string,
): Promise<BadgeKey[]> {
  const badges = await computeListingBadges(listingId, strategyId);
  await persistListingBadges(listingId, badges);
  logger.debug('[BadgeService] Badges refreshed', { listingId, badges });
  return badges;
}

/**
 * Refresh badges for all active listings (batch job).
 */
export async function refreshAllListingBadges(): Promise<{
  updated: number;
  errors: number;
}> {
  const listings = await fetchAllListingsForBadging();
  let updated = 0;
  let errors = 0;

  for (const { listingId, strategyId } of listings) {
    try {
      await refreshListingBadges(listingId, strategyId);
      updated++;
    } catch (error) {
      errors++;
      logger.error('[BadgeService] Failed to refresh badges', { error, listingId });
    }
  }

  logger.info('[BadgeService] Badge refresh complete', {
    total: listings.length, updated, errors,
  });
  return { updated, errors };
}

/**
 * Get badge definitions from the database.
 */
export async function getBadgeDefinitions(): Promise<BadgeDefinition[]> {
  return fetchBadgeDefinitions();
}

/**
 * Get badges for a specific listing with full definitions.
 */
export async function getListingBadges(listingId: string): Promise<BadgeDefinition[]> {
  const keys = await fetchListingBadgeKeys(listingId);
  if (keys.length === 0) return [];

  const allDefs = await fetchBadgeDefinitions();
  const defMap = new Map(allDefs.map((d) => [d.key, d]));
  return keys
    .map((k) => defMap.get(k))
    .filter((d): d is BadgeDefinition => d !== undefined);
}
