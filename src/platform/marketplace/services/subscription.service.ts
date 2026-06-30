import { AuditLogService } from '../../audit/audit-log-service';
import { SubscriptionRepository, subscriptionRepository, ReviewRepository, reviewRepository, ListingRepository, listingRepository } from './repositories';
import { NotificationService } from '../notifications/notification-service';
import type { IMarketplaceSubscription, IMarketplaceReview, CustomRiskLimits } from '../models/types';

export class SubscriptionService {
  private static instance: SubscriptionService;
  private subRepo: SubscriptionRepository;
  private reviewRepo: ReviewRepository;
  private listingRepo: ListingRepository;
  private auditService: AuditLogService;
  private notificationService: NotificationService;

  private constructor() {
    this.subRepo = subscriptionRepository;
    this.reviewRepo = reviewRepository;
    this.listingRepo = listingRepository;
    this.auditService = AuditLogService.getInstance();
    this.notificationService = NotificationService.getInstance();
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  async subscribe(data: {
    tenantId: string;
    userId: string;
    listingId: string;
    allocationPercent: number;
    customRiskLimits?: CustomRiskLimits;
  }): Promise<IMarketplaceSubscription> {
    const id = `sub_${Date.now()}_${data.userId.slice(0, 8)}`;
    const subscription = await this.subRepo.create({
      id,
      tenantId: data.tenantId,
      listingId: data.listingId,
      strategyId: '', // Will be set from listing
      allocationPercent: data.allocationPercent,
      customRiskLimits: data.customRiskLimits as Record<string, unknown> | undefined,
      currentInvestmentUsd: 0,
    });

    // Notify buyer and seller
    const listing = await this.listingRepo.findById(data.listingId);
    if (listing) {
      const strategy = await this.strategyRepoForListing(listing.strategyId);
      if (strategy) {
        this.notificationService.sendSubscriptionConfirmation({
          subscriptionId: subscription.id,
          buyerId: data.tenantId,
          sellerId: strategy.creatorId,
          strategyName: strategy.name,
          priceUsdMonthly: listing.priceUsdMonthly,
        });
      }
    }

    await this.auditService.log(data.tenantId, 'api_call' as any, {
      tier: undefined,
      metadata: {
        action: 'subscription_created',
        userId: data.userId,
        resourceId: subscription.id,
      },
    });

    return subscription;
  }

  async listSubscriptions(
    tenantId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ): Promise<{
    data: IMarketplaceSubscription[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const result = await this.subRepo.findAll({ tenantId, status: filters?.status });
    return {
      data: result.data,
      total: result.total,
      page: filters?.page || 1,
      limit: filters?.limit || 20,
      totalPages: result.totalPages,
    };
  }

  async getSubscription(id: string): Promise<IMarketplaceSubscription | null> {
    return this.subRepo.findById(id);
  }

  async updateSubscriptionStatus(
    id: string,
    action: string,
    userId: string,
  ): Promise<IMarketplaceSubscription | null> {
    const statusMap: Record<string, string> = {
      pause: 'paused',
      resume: 'active',
      cancel: 'cancelled',
    };
    const updated = await this.subRepo.update(id, { status: statusMap[action] as any });
    if (updated) {
      await this.auditService.log(updated.tenantId, 'api_call' as any, {
        tier: undefined,
        metadata: {
          action: `subscription_${action}`,
          userId,
          resourceId: id,
        },
      });
    }
    return updated;
  }

  async getSubscriptionPerformance(id: string): Promise<{
    totalPnlUsd: number;
    winRate: number;
    totalTrades: number;
  } | null> {
    const sub = await this.subRepo.findById(id);
    if (!sub) return null;
    return {
      totalPnlUsd: sub.totalPnlUsd,
      winRate: 0,
      totalTrades: 0,
    };
  }

  async hasActiveSubscription(tenantId: string, strategyId: string): Promise<boolean> {
    return this.subRepo.hasActiveSubscription(tenantId, strategyId);
  }

  async createReview(data: {
    strategyId: string;
    tenantId: string;
    userId: string;
    rating: number;
    comment: string;
  }): Promise<IMarketplaceReview> {
    const id = `rev_${Date.now()}_${data.userId.slice(0, 8)}`;
    return this.reviewRepo.create({
      id,
      tenantId: data.tenantId,
      strategyId: data.strategyId,
      subscriptionId: '',
      rating: data.rating,
      comment: data.comment,
      isVerified: true,
    });
  }

  async getReview(id: string): Promise<IMarketplaceReview | null> {
    return this.reviewRepo.findById(id);
  }

  async markReviewHelpful(id: string): Promise<IMarketplaceReview | null> {
    this.reviewRepo.incrementHelpful(id);
    return this.reviewRepo.findById(id);
  }

  async flagReview(id: string): Promise<IMarketplaceReview | null> {
    this.reviewRepo.incrementReported(id);
    return this.reviewRepo.update(id, { isFlagged: true });
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async strategyRepoForListing(strategyId: string): Promise<{ id: string; creatorId: string; name: string } | null> {
    const { StrategyRepository, strategyRepository } = await import('./repositories');
    const repo = strategyRepository as InstanceType<typeof StrategyRepository>;
    const strategy = await repo.findById(strategyId);
    if (!strategy) return null;
    return { id: strategy.id, creatorId: strategy.creatorId, name: strategy.name };
  }
}
