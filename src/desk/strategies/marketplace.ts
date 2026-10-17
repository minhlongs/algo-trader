// SPDX-License-Identifier: MIT
/**
 * Step 19: Strategy Marketplace & Creator RevShare Manager
 * Manages marketplace strategy registry, creator licensing, and automated
 * 70% creator / 30% platform revenue sharing computation.
 *
 * @module desk/strategies/marketplace
 */

import { logger } from '../../shared/utils/logger';

export interface MarketplaceStrategyListing {
  readonly strategyId: string;
  readonly creatorId: string;
  readonly name: string;
  readonly descriptionVi: string;
  readonly descriptionEn: string;
  readonly monthlySubscriptionUsd: number;
  readonly activeSubscribersCount: number;
  readonly isVerified: boolean;
}

export interface RevShareBreakdown {
  readonly strategyId: string;
  readonly creatorId: string;
  readonly grossRevenueUsd: number;
  readonly creatorShareUsd: number;
  readonly platformShareUsd: number;
  readonly creatorPercentage: number;
  readonly platformPercentage: number;
}

export class StrategyMarketplaceManager {
  private readonly listings = new Map<string, MarketplaceStrategyListing>();
  private readonly CREATOR_REV_SHARE_PCT = 0.7;
  private readonly PLATFORM_REV_SHARE_PCT = 0.3;

  public registerListing(listing: MarketplaceStrategyListing): void {
    if (listing.monthlySubscriptionUsd < 0) {
      throw new Error('Subscription price must be non-negative');
    }
    this.listings.set(listing.strategyId, listing);
    logger.info(`[StrategyMarketplace] Registered listing ${listing.strategyId} for creator ${listing.creatorId}`);
  }

  public getListing(strategyId: string): MarketplaceStrategyListing | undefined {
    return this.listings.get(strategyId);
  }

  public listAll(): readonly MarketplaceStrategyListing[] {
    return Array.from(this.listings.values());
  }

  public calculateMonthlyRevShare(strategyId: string): RevShareBreakdown {
    const listing = this.listings.get(strategyId);
    if (!listing) {
      throw new Error(`Strategy listing '${strategyId}' not found in marketplace`);
    }

    const grossRevenueUsd = Number(
      (listing.monthlySubscriptionUsd * listing.activeSubscribersCount).toFixed(2)
    );
    const creatorShareUsd = Number((grossRevenueUsd * this.CREATOR_REV_SHARE_PCT).toFixed(2));
    const platformShareUsd = Number((grossRevenueUsd - creatorShareUsd).toFixed(2));

    return {
      strategyId,
      creatorId: listing.creatorId,
      grossRevenueUsd,
      creatorShareUsd,
      platformShareUsd,
      creatorPercentage: 70,
      platformPercentage: 30,
    };
  }

  public recordSubscriberAdd(strategyId: string): void {
    const listing = this.listings.get(strategyId);
    if (listing) {
      this.listings.set(strategyId, {
        ...listing,
        activeSubscribersCount: listing.activeSubscribersCount + 1,
      });
    }
  }
}
