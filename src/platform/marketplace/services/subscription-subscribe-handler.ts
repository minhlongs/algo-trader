/**
 * Subscription Subscribe Handler
 * Handles creation of new marketplace subscriptions, payment links, and audit logging.
 */

import { AuditLogService } from '../../audit/audit-log-service';
import { NowPaymentsService } from '../../billing/nowpayments-service';
import { NotificationService } from '../notifications/notification-service';
import type { CustomRiskLimits, IMarketplaceSubscription } from '../models/types';
import type { ListingRepository, SubscriptionRepository } from './repositories';

export interface SubscribeParams {
  tenantId: string;
  userId: string;
  listingId: string;
  allocationPercent: number;
  customRiskLimits?: CustomRiskLimits;
}

export interface SubscribeContext {
  subRepo: SubscriptionRepository;
  listingRepo: ListingRepository;
  auditService: AuditLogService;
  notificationService: NotificationService;
  getStrategy: (strategyId: string) => Promise<{ id: string; creatorId: string; name: string } | null>;
}

export async function createMarketplaceSubscription(
  ctx: SubscribeContext,
  data: SubscribeParams
): Promise<{ subscription: IMarketplaceSubscription; checkoutUrl: string | null }> {
  const id = `sub_${Date.now()}_${data.userId.slice(0, 8)}`;

  const listing = await ctx.listingRepo.findById(data.listingId);
  if (!listing) throw new Error('Listing not found');
  if (!listing.isActive) throw new Error('Listing is not active');

  const hasActive = await ctx.subRepo.hasActiveSubscription(data.tenantId, listing.strategyId);
  if (hasActive) throw new Error('Already subscribed to this strategy');

  let paymentId: string | undefined;
  let checkoutUrl: string | null = null;
  let strategy: { id: string; creatorId: string; name: string } | null = null;

  if (listing.priceUsdMonthly > 0) {
    const nowpaymentsService = NowPaymentsService.getInstance();
    strategy = await ctx.getStrategy(listing.strategyId);
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

  const subscription = await ctx.subRepo.create({
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
    ctx.notificationService.sendSubscriptionConfirmation({
      subscriptionId: subscription.id,
      buyerId: data.tenantId,
      sellerId: strategy.creatorId,
      strategyName: strategy.name,
      priceUsdMonthly: listing.priceUsdMonthly,
    });
  }

  await ctx.auditService.log(data.tenantId, 'api_call', {
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
