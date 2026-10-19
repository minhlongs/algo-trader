import { AuditLogService } from '../../audit/audit-log-service';
import { SubscriptionRepository, subscriptionRepository, ReviewRepository, reviewRepository, ListingRepository, listingRepository } from './repositories';
import { NotificationService } from '../notifications/notification-service';
import type { IMarketplaceSubscription, IMarketplaceReview, CustomRiskLimits, SubscriptionStatus } from '../models/types';
import { activateByPaymentId as _activateByPaymentId, cancelByPaymentId as _cancelByPaymentId } from './subscription-payment-handlers';
import { createReview as _createReview, getReview as _getReview, markReviewHelpful as _markReviewHelpful, flagReview as _flagReview } from './subscription-review-handlers';
import { createMarketplaceSubscription } from './subscription-subscribe-handler';

export * from './subscription-payment-handlers';
export * from './subscription-review-handlers';
export * from './subscription-subscribe-handler';

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
  }): Promise<{ subscription: IMarketplaceSubscription; checkoutUrl: string | null }> {
    return createMarketplaceSubscription(
      {
        subRepo: this.subRepo,
        listingRepo: this.listingRepo,
        auditService: this.auditService,
        notificationService: this.notificationService,
        getStrategy: (id) => this.strategyRepoForListing(id),
      },
      data
    );
  }

  async activateByPaymentId(paymentId: string): Promise<IMarketplaceSubscription | null> {
    return _activateByPaymentId(paymentId, this.subRepo, this.listingRepo, this.auditService);
  }

  async cancelByPaymentId(paymentId: string): Promise<IMarketplaceSubscription | null> {
    return _cancelByPaymentId(paymentId, this.subRepo, this.auditService);
  }

  async listSubscriptions(
    tenantId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ): Promise<{ data: IMarketplaceSubscription[]; total: number; page: number; limit: number; totalPages: number }> {
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

  async updateSubscriptionStatus(id: string, action: string, userId: string): Promise<IMarketplaceSubscription | null> {
    const statusMap: Record<string, SubscriptionStatus> = { pause: 'paused', resume: 'active', cancel: 'cancelled' };
    const updated = await this.subRepo.update(id, { status: statusMap[action] });
    if (updated) {
      await this.auditService.log(updated.tenantId, 'api_call', {
        tier: undefined,
        metadata: { action: `subscription_${action}`, userId, resourceId: id },
      });
    }
    return updated;
  }

  async getSubscriptionPerformance(id: string): Promise<{ totalPnlUsd: number; winRate: number; totalTrades: number } | null> {
    const sub = await this.subRepo.findById(id);
    if (!sub) return null;
    return { totalPnlUsd: sub.totalPnlUsd, winRate: 0, totalTrades: 0 };
  }

  async hasActiveSubscription(tenantId: string, strategyId: string): Promise<boolean> {
    return this.subRepo.hasActiveSubscription(tenantId, strategyId);
  }

  async createReview(data: { strategyId: string; tenantId: string; userId: string; rating: number; comment: string }): Promise<IMarketplaceReview> {
    return _createReview(data, this.reviewRepo);
  }

  async getReview(id: string): Promise<IMarketplaceReview | null> {
    return _getReview(id, this.reviewRepo);
  }

  async markReviewHelpful(id: string): Promise<IMarketplaceReview | null> {
    return _markReviewHelpful(id, this.reviewRepo);
  }

  async flagReview(id: string): Promise<IMarketplaceReview | null> {
    return _flagReview(id, this.reviewRepo);
  }

  /** Look up subscription by NOWPayments payment_id (used by webhook handler). */
  async getSubscriptionByPaymentId(paymentId: string): Promise<IMarketplaceSubscription | null> {
    return this.subRepo.findByPaymentId(paymentId);
  }

  /** Get strategy metadata for a subscription (used for revenue attribution). */
  async getStrategyForSubscription(strategyId: string): Promise<{ id: string; creatorId: string; name: string } | null> {
    return this.strategyRepoForListing(strategyId);
  }

  /** Get listing metadata for a subscription (used for revenue calculation). */
  async getListingForSubscription(listingId: string): Promise<{ priceUsdMonthly: number; billingCycle: string } | null> {
    const listing = await this.listingRepo.findById(listingId);
    if (!listing) return null;
    return { priceUsdMonthly: listing.priceUsdMonthly, billingCycle: listing.billingCycle };
  }

  // ── Private helpers ───────────────────────────────────────────────
  private async strategyRepoForListing(strategyId: string): Promise<{ id: string; creatorId: string; name: string } | null> {
    const { strategyRepository: repo } = await import('./repositories');
    const strategy = await repo.findById(strategyId);
    if (!strategy) return null;
    return { id: strategy.id, creatorId: strategy.creatorId, name: strategy.name };
  }
}
