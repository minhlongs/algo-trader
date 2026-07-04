/**
 * Marketplace Payment Webhook Handler
 * Handles NOWPayments IPN callbacks for marketplace strategy subscriptions.
 *
 * Payment flow:
 * 1. User subscribes → NOWPayments invoice created → subscription status='pending_payment'
 * 2. User pays USDT → NOWPayments sends IPN with status='finished'
 * 3. This handler activates the subscription → status='active' + subscriber_count++
 * 4. On refund/failure → subscription cancelled
 */

import { SubscriptionService } from '../../../../marketplace/services/subscription.service';
import { RevenueService } from '../../../../marketplace/services/revenue.service';
import { AuditLogService } from '../../../../audit/audit-log-service';
import { NowPaymentsService, NowPaymentsIpnPayload } from '../../../../billing/nowpayments-service';
import { logger } from '../../../../../shared/utils/logger';

/**
 * Handle IPN status=finished → activate marketplace subscription.
 */
export async function handleMarketplaceIpnFinished(
  ipn: NowPaymentsIpnPayload,
  _nowpaymentsService: NowPaymentsService,
): Promise<void> {
  const subscriptionService = SubscriptionService.getInstance();
  const revenueService = RevenueService.getInstance();
  const auditService = AuditLogService.getInstance();

  // Idempotency: check if already processed
  const existing =
    await subscriptionService.getSubscriptionByPaymentId(ipn.payment_id);
  if (existing && existing.status === 'active') {
    logger.info('Marketplace subscription already active, skipping', {
      subscriptionId: existing.id,
      paymentId: ipn.payment_id,
    });
    return;
  }

  // Activate subscription
  const activated = await subscriptionService.activateByPaymentId(ipn.payment_id);

  if (activated) {
    // Record revenue share — resolve creator from strategy
    const strategy = await subscriptionService.getStrategyForSubscription(
      activated.strategyId,
    );
    const creatorId = strategy?.creatorId ?? activated.tenantId;

    const listing = await subscriptionService.getListingForSubscription(
      activated.listingId,
    );
    const grossRevenueCents = listing?.priceUsdMonthly ?? 0;

    if (grossRevenueCents > 0) {
      await revenueService.requestPayout(creatorId, grossRevenueCents, {
        subscriptionId: activated.id,
        strategyId: activated.strategyId,
        periodStart: new Date(),
        periodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
      });
    }

    await auditService.log(activated.tenantId, 'api_call' as any, {
      tier: undefined,
      metadata: {
        eventType: 'marketplace_payment_finished',
        paymentId: ipn.payment_id,
        subscriptionId: activated.id,
        amount: ipn.price_amount,
      },
    });

    logger.info('Marketplace payment processed', {
      paymentId: ipn.payment_id,
      subscriptionId: activated.id,
      listingId: activated.listingId,
    });
  }
}

/**
 * Handle IPN status=refunded|failed|expired → cancel marketplace subscription.
 */
export async function handleMarketplaceIpnCancelled(
  ipn: NowPaymentsIpnPayload,
): Promise<void> {
  const subscriptionService = SubscriptionService.getInstance();
  const auditService = AuditLogService.getInstance();

  const cancelled = await subscriptionService.cancelByPaymentId(ipn.payment_id);

  if (cancelled) {
    await auditService.log(cancelled.tenantId, 'api_call' as any, {
      tier: undefined,
      metadata: {
        eventType: 'marketplace_payment_cancelled',
        paymentId: ipn.payment_id,
        paymentStatus: ipn.payment_status,
        subscriptionId: cancelled.id,
      },
    });

    logger.info('Marketplace subscription cancelled due to payment', {
      paymentId: ipn.payment_id,
      status: ipn.payment_status,
      subscriptionId: cancelled.id,
    });
  }
}
