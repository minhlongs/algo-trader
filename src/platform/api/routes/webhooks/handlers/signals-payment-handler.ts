/**
 * Signals API Payment Handler
 *
 * Handles NOWPayments IPN callbacks for signals tier subscriptions.
 *
 * Payment flow:
 * 1. User requests checkout → order_id = "sig_{subscriberId}_{timestamp}"
 * 2. User pays USDT → NOWPayments sends IPN with status="finished"
 * 3. This handler activates the signal subscription → tier=BASIC/PRO/ENTERPRISE
 * 4. On refund/failure/expiry → subscription deactivated
 */

import { NowPaymentsService, NowPaymentsIpnPayload } from '../../../../billing/nowpayments-service';
import { signalSubscriberRepo } from '../../../../signal/signal-subscriber-repository-d1';
import { logger } from '../../../../../shared/utils/logger';

/**
 * Handle IPN status=finished → activate/upgrade signal subscription tier.
 *
 * Tier detection: matches price_amount against known signals tier prices.
 * - $29 → BASIC
 * - $99 → PRO
 * - $299 → ENTERPRISE
 *
 * order_id format: sig_{subscriberId}_{timestamp}
 */
export async function handleSignalsIpnFinished(
  ipn: NowPaymentsIpnPayload,
  _subscriptionService?: unknown,
  _signalRepo?: unknown,
): Promise<void> {
  // Parse subscriberId from order_id: sig_{ref}_{ts}
  const parts = ipn.order_id?.split('_') ?? [];
  const subscriberId = parts.length >= 2 ? parts[1] : null;

  if (!subscriberId) {
    logger.warn('[SignalsPayment] No subscriberId in order_id', { orderId: ipn.order_id });
    return;
  }

  // Map payment tier → signal delivery tier (BASIC = FREE for delivery)
  const PAYMENT_TO_SIGNAL_TIER: Record<string, 'FREE' | 'PRO' | 'ENTERPRISE'> = {
    BASIC: 'FREE',
    PRO: 'PRO',
    ENTERPRISE: 'ENTERPRISE',
  };
  const amount = ipn.price_amount;
  const paymentTier = amount === 29 ? 'BASIC' : amount === 99 ? 'PRO' : amount === 299 ? 'ENTERPRISE' : null;
  if (!paymentTier) {
    logger.warn('[SignalsPayment] Unrecognized payment amount', { amount, paymentId: ipn.payment_id });
    return;
  }
  const tier = PAYMENT_TO_SIGNAL_TIER[paymentTier];

  // Upsert subscription with new tier
  const existing = await signalSubscriberRepo.getBySubscriberId(subscriberId);
  const now = Date.now();

  if (existing) {
    await signalSubscriberRepo.upsert({
      id: existing.id,
      subscriberId,
      chatId: existing.chatId,
      tier,
      active: true,
      createdAt: existing.createdAt,
      updatedAt: now,
    });
    logger.info('[SignalsPayment] Subscription upgraded', { subscriberId, tier, paymentId: ipn.payment_id });
  } else {
    await signalSubscriberRepo.upsert({
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      subscriberId,
      chatId: undefined,
      tier,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    logger.info('[SignalsPayment] Subscription created', { subscriberId, tier, paymentId: ipn.payment_id });
  }
}

/**
 * Handle IPN status=refunded|failed|expired → deactivate signal subscription.
 */
export async function handleSignalsIpnCancelled(
  ipn: NowPaymentsIpnPayload,
  _signalRepo?: unknown,
): Promise<void> {
  const parts = ipn.order_id?.split('_') ?? [];
  const subscriberId = parts.length >= 2 ? parts[1] : null;

  if (!subscriberId) {
    logger.warn('[SignalsPayment] No subscriberId in order_id for cancellation', { orderId: ipn.order_id });
    return;
  }

  const existing = await signalSubscriberRepo.getBySubscriberId(subscriberId);
  if (existing) {
    await signalSubscriberRepo.setActive(subscriberId, false);
    logger.info('[SignalsPayment] Subscription cancelled', { subscriberId, status: ipn.payment_status, paymentId: ipn.payment_id });
  }
}
