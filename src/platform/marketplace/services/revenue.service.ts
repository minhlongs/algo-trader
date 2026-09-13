import { logger } from '../../../shared/utils/logger';
import { RevenueShareRepository, revenueShareRepository } from './repositories';
import type { IMarketplaceRevenueShare, IMarketplaceSubscription } from '../models/types';
import {
  PayoutCalculationResult,
  RevenueOverviewResult,
  RevenueReportResult,
  PayoutRequestMeta,
} from './revenue.types';
import {
  calculatePayoutSplit,
  aggregateRevenueOverview,
  aggregateRevenueReport,
} from './revenue-calculator';

export type {
  PayoutCalculationResult,
  RevenueOverviewResult,
  RevenueReportResult,
  PayoutRequestMeta,
};

export class RevenueService {
  private static instance: RevenueService;
  private revenueRepo: RevenueShareRepository;

  constructor() {
    this.revenueRepo = revenueShareRepository;
  }

  static getInstance(): RevenueService {
    if (!RevenueService.instance) {
      RevenueService.instance = new RevenueService();
    }
    return RevenueService.instance;
  }

  async getRevenueOverview(
    filters?: { periodStart?: string; periodEnd?: string }
  ): Promise<RevenueOverviewResult> {
    const all = await this.revenueRepo.findAll(
      filters?.periodStart ? { periodStart: new Date(filters.periodStart) } : undefined,
    );
    return aggregateRevenueOverview(all.data, filters);
  }

  async getAllCreatorPayouts(): Promise<IMarketplaceRevenueShare[]> {
    const result = await this.revenueRepo.findAll();
    return result.data;
  }

  async calculateCreatorPayout(
    subscriptionId: string,
    amount: number,
  ): Promise<PayoutCalculationResult> {
    const split = calculatePayoutSplit(subscriptionId, amount);

    logger.info('[RevenueService] Calculated payout', {
      subscriptionId,
      grossRevenueCents: amount,
      platformShareCents: split.platformShareCents,
      creatorShareCents: split.creatorShareCents,
    });

    return split;
  }

  async requestPayout(
    creatorId: string,
    amount: number,
    meta?: PayoutRequestMeta,
  ): Promise<IMarketplaceRevenueShare> {
    if (amount <= 0) {
      throw new Error('Payout amount must be a positive number');
    }

    const subscriptionId = meta?.subscriptionId;
    if (!subscriptionId) {
      throw new Error('subscriptionId is required to request a payout');
    }

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

    const split = calculatePayoutSplit(subscriptionId, amount);
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
      platformShareCents: split.platformShareCents,
      creatorShareCents: split.creatorShareCents,
      status: 'pending',
    });

    logger.info('[RevenueService] Payout requested', {
      id,
      creatorId,
      subscriptionId,
      grossRevenueCents: amount,
      creatorShareCents: split.creatorShareCents,
    });

    return record;
  }

  async getRevenueReport(
    tenantId: string,
    period: { start: Date; end: Date },
  ): Promise<RevenueReportResult> {
    const filters = {
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
    };

    const result = await this.revenueRepo.findAll(filters);
    const report = aggregateRevenueReport(result.data, tenantId, period);

    logger.info('[RevenueService] Revenue report generated', {
      tenantId,
      periodStart: period.start,
      periodEnd: period.end,
      totalGrossRevenueCents: report.totalGrossRevenueCents,
      totalCreatorShareCents: report.totalCreatorShareCents,
      transactionCount: report.transactionCount,
    });

    return report;
  }

  private async lookupSubscription(subscriptionId: string): Promise<IMarketplaceSubscription | null> {
    const { SubscriptionRepository, subscriptionRepository } = await import('./repositories');
    const repo = subscriptionRepository as InstanceType<typeof SubscriptionRepository>;
    return repo.findById(subscriptionId);
  }
}
