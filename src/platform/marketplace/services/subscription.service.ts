import { AuditLogService } from '../../audit/audit-log-service';
import { SubscriptionRepository, subscriptionRepository, ReviewRepository, reviewRepository, ListingRepository, listingRepository } from './repositories';
import { NotificationService } from '../notifications/notification-service';
import { NowPaymentsService } from '../../billing/nowpayments-service';
import type { IMarketplaceSubscription, IMarketplaceReview, CustomRiskLimits } from '../models/types';
import { activateByPaymentId as _activateByPaymentId, cancelByPaymentId as _cancelByPaymentId } from './subscription-payment-handlers';
import { createReview as _createReview, getReview as _getReview, markReviewHelpful as _markReviewHelpful, flagReview as _flagReview } from './subscription-review-handlers';

export * from './subscription-payment-handlers';
export * from './subscription-review-handlers';

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
    const id = `sub_${Date.now()}_${data.userId.slice(0, 8)}`;

    const listing = await this.listingRepo.findById(data.listingId);
    if (!listing) throw new Error('Listing not found');
    if (!listing.isActive) throw new Error('Listing is not active');

    const hasActive = await this.subRepo.hasActiveSubscription(data.tenantId, listing.strategyId);
    if (hasActive) throw new Error('Already subscribed to this strategy');

    let paymentId: string | undefined;
    let checkoutUrl: string | null = null;
    let strategy: { id: string; creatorId: string; name: string } | null = null;

    if (listing.priceUsdMonthly > 0) {
      const nowpaymentsService = NowPaymentsService.getInstance();
      strategy = await this.strategyRepoForListing(listing.strategyId);
      const strategyName = strategy?.name ?? 'Strategy Subscription';

      const result = await nowpaymentsService.createMarketplaceCheckoutUrl({
        listingId: data.listingId,
        strategyName,
        priceUsd: listing.priceUsdMonthly / 100,
        tenantId: data.tenantId,
      });

      if (result) {
        paymentId = result.paymentId;
        checkoutUrl = result.checkoutUrl;
      }
    }

    const subscription = await this.subRepo.create({
      id,
      tenantId: data.tenantId,
      listingId: data.listingId,
      strategyId: listing.strategyId,
      allocationPercent: data.allocationPercent,
      customRiskLimits: data.customRiskLimits as Record<string, unknown> | undefined,
      currentInvestmentUsd: 0,
      paymentId,
      paymentStatus: paymentId ? 'pending' : undefined,
      initialStatus: paymentId ? 'pending_payment' : 'active',
    });

    if (checkoutUrl && strategy) {
      this.notificationService.sendSubscriptionConfirmation({
        subscriptionId: subscription.id,
        buyerId: data.tenantId,
        sellerId: strategy.creatorId,
        strategyName: strategy.name,
        priceUsdMonthly: listing.priceUsdMonthly,
      });
    }

    await this.auditService.log(data.tenantId, 'api_call' as any, {
      tier: undefined,
      metadata: {
        action: 'subscription_created',
        userId: data.userId,
        resourceId: subscription.id,
        listingId: data.listingId,
        paymentId: paymentId ?? null,
      },
    });

    return { subscription, checkoutUrl };
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
    const statusMap: Record<string, string> = { pause: 'paused', resume: 'active', cancel: 'cancelled' };
    const updated = await this.subRepo.update(id, { status: statusMap[action] as any });
    if (updated) {
      await this.auditService.log(updated.tenantId, 'api_call' as any, {
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
    const { StrategyRepository, strategyRepository } = await import('./repositories');
    const repo = strategyRepository as InstanceType<typeof StrategyRepository>;
    const strategy = await repo.findById(strategyId);
    if (!strategy) return null;
    return { id: strategy.id, creatorId: strategy.creatorId, name: strategy.name };
  }
}
