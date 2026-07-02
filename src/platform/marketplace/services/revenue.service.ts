import { logger } from '../../../shared/utils/logger';
import { RevenueShareRepository, revenueShareRepository } from './repositories';
import type { IMarketplaceRevenueShare, IMarketplaceSubscription} from '../models/types';

const PLATFORM_FEE_PERCENT = 0.2;   // 20%
const CREATOR_SHARE_PERCENT = 0.8;  // 80%

export class RevenueService {
  private static instance: RevenueService;
  private revenueRepo: RevenueShareRepository;

  private constructor() {
    this.revenueRepo = revenueShareRepository;
  }

  static getInstance(): RevenueService {
    if (!RevenueService.instance) {
      RevenueService.instance = new RevenueService();
    }
    return RevenueService.instance;
  }

  async getRevenueOverview(filters?: { periodStart?: string; periodEnd?: string }): Promise<{ totalRevenue: number; totalPayouts: number; pending: number; period?: { start?: string; end?: string } }> {
    const all = await this.revenueRepo.findAll(
      filters?.periodStart ? { periodStart: new Date(filters.periodStart) } : undefined,
    );
    const total = all.data.reduce((sum: number, r: IMarketplaceRevenueShare) => sum + r.grossRevenueCents, 0);
    const payouts = all.data
      .filter((r: IMarketplaceRevenueShare) => r.status === 'paid')
      .reduce((sum: number, r: IMarketplaceRevenueShare) => sum + r.creatorShareCents, 0);
    const pending = all.data
      .filter((r: IMarketplaceRevenueShare) => r.status === 'pending')
      .reduce((sum: number, r: IMarketplaceRevenueShare) => sum + r.creatorShareCents, 0);

    return {
      totalRevenue: total,
      totalPayouts: payouts,
      pending,
      period: filters ? { start: filters.periodStart, end: filters.periodEnd } : undefined,
    };
  }

  async getAllCreatorPayouts(): Promise<IMarketplaceRevenueShare[]> {
    const result = await this.revenueRepo.findAll();
    return result.data;
  }

  /**
   * Calculate platform fee and creator share for a subscription revenue event.
   * Returns the split breakdown without persisting anything.
   */
  async calculateCreatorPayout(
    subscriptionId: string,
    amount: number,
  ): Promise<{
    subscriptionId: string;
    grossRevenueCents: number;
    platformShareCents: number;
    creatorShareCents: number;
    platformFeePercent: number;
    creatorSharePercent: number;
  }> {
    if (amount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const platformShareCents = Math.round(amount * PLATFORM_FEE_PERCENT);
    const creatorShareCents = amount - platformShareCents;

    logger.info('[RevenueService] Calculated payout', {
      subscriptionId,
      grossRevenueCents: amount,
      platformShareCents,
      creatorShareCents,
    });

    return {
      subscriptionId,
      grossRevenueCents: amount,
      platformShareCents,
      creatorShareCents,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      creatorSharePercent: CREATOR_SHARE_PERCENT,
    };
  }

  /**
   * Create a payout request record for a creator.
   * Looks up the subscription to get strategyId and tenantId, then inserts a revenue share row.
   */
  async requestPayout(
    creatorId: string,
    amount: number,
    meta?: { subscriptionId?: string; strategyId?: string; periodStart?: Date; periodEnd?: Date },
  ): Promise<IMarketplaceRevenueShare> {
    if (amount <= 0) {
      throw new Error('Payout amount must be a positive number');
    }

    const subscriptionId = meta?.subscriptionId;
    if (!subscriptionId) {
      throw new Error('subscriptionId is required to request a payout');
    }

    // Resolve strategyId and tenantId from the subscription if not provided
    let strategyId = meta?.strategyId;
    let tenantId = creatorId;

    if (!strategyId) {
      const subscription = await this.lookupSubscription(subscriptionId);
      if (!subscription) {
        throw new Error(`Subscription not found: ${subscriptionId}`);
      }
      strategyId = subscription.strategyId;
      tenantId = subscription.tenantId;
    }

    const platformShareCents = Math.round(amount * PLATFORM_FEE_PERCENT);
    const creatorShareCents = amount - platformShareCents;

    const id = `rev_${Date.now()}_${creatorId.slice(0, 8)}`;
    const now = new Date();

    const record = await this.revenueRepo.create({
      id,
      strategyId,
      tenantId,
      subscriptionId,
      periodStart: meta?.periodStart ?? now,
      periodEnd: meta?.periodEnd ?? now,
      grossRevenueCents: amount,
      platformShareCents,
      creatorShareCents,
      status: 'pending',
    });

    logger.info('[RevenueService] Payout requested', {
      id,
      creatorId,
      subscriptionId,
      grossRevenueCents: amount,
      creatorShareCents,
    });

    return record;
  }

  /**
   * Return a revenue summary for a given tenant and period.
   * Aggregates gross revenue, platform share, creator share, and pending vs paid breakdown.
   */
  async getRevenueReport(
    tenantId: string,
    period: { start: Date; end: Date },
  ): Promise<{
    tenantId: string;
    period: { start: Date; end: Date };
    totalGrossRevenueCents: number;
    totalPlatformShareCents: number;
    totalCreatorShareCents: number;
    paidCents: number;
    pendingCents: number;
    voidCents: number;
    transactionCount: number;
    records: IMarketplaceRevenueShare[];
  }> {
    const filters = {
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
    };

    const result = await this.revenueRepo.findAll(filters);

    const records = result.data;
    const totalGrossRevenueCents = records.reduce((s, r) => s + r.grossRevenueCents, 0);
    const totalPlatformShareCents = records.reduce((s, r) => s + r.platformShareCents, 0);
    const totalCreatorShareCents = records.reduce((s, r) => s + r.creatorShareCents, 0);

    const paidCents = records
      .filter((r) => r.status === 'paid')
      .reduce((s, r) => s + r.creatorShareCents, 0);
    const pendingCents = records
      .filter((r) => r.status === 'pending')
      .reduce((s, r) => s + r.creatorShareCents, 0);
    const voidCents = records
      .filter((r) => r.status === 'void')
      .reduce((s, r) => s + r.creatorShareCents, 0);

    logger.info('[RevenueService] Revenue report generated', {
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
      totalGrossRevenueCents,
      totalCreatorShareCents,
      transactionCount: records.length,
    });

    return {
      tenantId,
      period,
      totalGrossRevenueCents,
      totalPlatformShareCents,
      totalCreatorShareCents,
      paidCents,
      pendingCents,
      voidCents,
      transactionCount: records.length,
      records,
    };
  }

  // --- private helpers ---

  private async lookupSubscription(subscriptionId: string): Promise<IMarketplaceSubscription | null> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { SubscriptionRepository, subscriptionRepository } = await import('./repositories');
    const repo = subscriptionRepository as InstanceType<typeof SubscriptionRepository>;
    return repo.findById(subscriptionId);
  }
}
