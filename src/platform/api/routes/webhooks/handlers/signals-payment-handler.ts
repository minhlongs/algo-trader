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
 *
 * Tier provenance: the tier is resolved from the signals price book
 * (`SIGNALS_PRICE_BOOK`), never from the client payload or from an amount
 * literal typed inline in this file. Renaming or adjusting a price therefore
 * cannot silently stop granting a tier, and an amount that is not on the price
 * book fails closed instead of granting a guessed tier.
 */

import { NowPaymentsService, NowPaymentsIpnPayload } from '../../../../billing/nowpayments-service';
import { PaymentService } from '../../../../billing/payment-service';
import { signalSubscriberRepo } from '../../../../signal/signal-subscriber-repository-d1';
import {
  resolveSignalsTierForAmount,
  SignalsPriceNotFoundError,
} from '../../../../billing/signals-price-book';
import type { TierKey } from '../../../../../desk/signal/signal-types';
import { logger } from '../../../../../shared/utils/logger';

/**
 * Handle IPN status=finished → activate/upgrade signal subscription tier.
 *
 * order_id format: sig_{ref}_{ts}
 *
 * Throws when the settled amount resolves to no signals price-book entry. The
 * caller (webhook route) turns that into a 5xx so the provider retries and an
 * operator sees it; a customer who paid is never silently granted the wrong tier.
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

  // Idempotency: a replayed finished IPN for a payment_id already recorded must not
  // re-activate a subscription the customer has since cancelled. Mirrors the license
  // path's provider-payment dedupe (subscription-handler.ts).
  const paymentService = PaymentService.getInstance();
  const alreadyRecorded = await paymentService.getPaymentByProviderId(ipn.payment_id);
  if (alreadyRecorded) {
    logger.info('[SignalsPayment] Payment already recorded, skipping activation', {
      subscriberId,
      paymentId: ipn.payment_id,
    });
    return;
  }

  // Tier comes from the price book, not from a literal amount or a client payload.
  // Unmapped amounts throw so the caller fails closed.
  let tier: TierKey;
  let planName: string;
  try {
    const entry = resolveSignalsTierForAmount(ipn.price_amount);
    tier = entry.tier;
    planName = entry.name;
  } catch (error) {
    if (error instanceof SignalsPriceNotFoundError) {
      logger.error('[SignalsPayment] Paid amount absent from signals price book — no tier granted', {
        amount: ipn.price_amount,
        paymentId: ipn.payment_id,
        subscriberId,
      });
      throw error;
    }
    throw error;
  }

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
    logger.info('[SignalsPayment] Subscription upgraded', {
      subscriberId,
      tier,
      plan: planName,
      paymentId: ipn.payment_id,
    });
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
    logger.info('[SignalsPayment] Subscription created', {
      subscriberId,
      tier,
      plan: planName,
      paymentId: ipn.payment_id,
    });
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
