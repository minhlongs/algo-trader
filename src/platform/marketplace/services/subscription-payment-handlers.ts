import { logger } from '../../../shared/utils/logger';
import { AuditLogService } from '../../audit/audit-log-service';
import type { SubscriptionRepository } from './repositories';
import type { ListingRepository } from './repositories';
import type { IMarketplaceSubscription } from '../models/types';

/**
 * Activate a subscription by payment_id (called from NOWPayments webhook).
 * Transitions pending_payment → active and increments subscriber count.
 */
export async function activateByPaymentId(
  paymentId: string,
  subRepo: SubscriptionRepository,
  listingRepo: ListingRepository,
  auditService: AuditLogService,
): Promise<IMarketplaceSubscription | null> {
  const sub = await subRepo.findByPaymentId(paymentId);
  if (!sub) {
    logger.warn('No marketplace subscription found for payment', { paymentId });
    return null;
  }

  if (sub.status === 'active') {
    logger.info('Subscription already active', { subscriptionId: sub.id, paymentId });
    return sub;
  }

  const updated = await subRepo.update(sub.id, {
    status: 'active' as any,
    paymentStatus: 'paid',
  });

  if (updated) {
    await listingRepo.incrementSubscriberCount(sub.listingId, 1);

    await auditService.log(sub.tenantId, 'api_call' as any, {
      tier: undefined,
      metadata: {
        action: 'subscription_activated',
        resourceId: sub.id,
        paymentId,
        listingId: sub.listingId,
      },
    });

    logger.info('Marketplace subscription activated via payment', {
      subscriptionId: sub.id,
      paymentId,
      tenantId: sub.tenantId,
      listingId: sub.listingId,
    });
  }

  return updated;
}

/**
 * Cancel a subscription by payment_id (called from NOWPayments refunded/failed webhook).
 */
export async function cancelByPaymentId(
  paymentId: string,
  subRepo: SubscriptionRepository,
  auditService: AuditLogService,
): Promise<IMarketplaceSubscription | null> {
  const sub = await subRepo.findByPaymentId(paymentId);
  if (!sub) {
    logger.warn('No marketplace subscription found for payment', { paymentId });
    return null;
  }

  if (sub.status === 'cancelled') return sub;

  const updated = await subRepo.update(sub.id, {
    status: 'cancelled' as any,
    paymentStatus: 'failed',
  });

  if (updated) {
    await auditService.log(sub.tenantId, 'api_call' as any, {
      tier: undefined,
      metadata: {
        action: 'subscription_payment_failed',
        resourceId: sub.id,
        paymentId,
      },
    });
  }

  return updated;
}
