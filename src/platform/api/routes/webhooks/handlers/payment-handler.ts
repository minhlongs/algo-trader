/**
 * NOWPayments Payment Handler
 * Handle payment events from NOWPayments IPN with idempotency
 */

import { PaymentService } from '../../../../billing/payment-service';
import { NowPaymentsIpnPayload } from '../../../../billing/nowpayments-service';
import { generateInvoice } from '../../../../billing/invoice-generator';
import { resolveInvoiceChannel, resolveInvoiceTierLabel } from '../../../../billing/invoice-tier-label';
import { logger } from '../../../../../shared/utils/logger';

/**
 * Record successful payment (IPN status=finished)
 * Idempotent: skips if payment_id already recorded
 */
export async function handleIpnPaymentSuccess(
  ipn: NowPaymentsIpnPayload,
  paymentService: PaymentService
): Promise<void> {
  const existing = await paymentService.getPaymentByProviderId(ipn.payment_id);
  if (existing) return;

  await paymentService.recordPaymentSuccess(
    ipn.payment_id,
    ipn.order_id || '',
    ipn.price_amount,
    ipn.price_currency,
    ipn.invoice_id
  );

  // Auto-generate and email invoice
  const email = ipn.order_description?.match(/[\w.-]+@[\w.-]+\.[a-zA-Z]{2,}/)?.[0] || ipn.order_id || '';
  if (email.includes('@')) {
    // Plan label comes from a price book, not from amount brackets. An amount that
    // matches no book produces no invoice rather than a label the customer never bought.
    const channel = resolveInvoiceChannel(ipn.order_id);
    const tier = resolveInvoiceTierLabel(channel, ipn.price_amount);
    if (tier === null) {
      logger.warn('[PaymentHandler] Paid amount matches no price book — invoice label left unset', {
        paymentId: ipn.payment_id,
        channel,
        amount: ipn.price_amount,
      });
    }
    await generateInvoice({
      paymentId: ipn.payment_id,
      email,
      tier: tier ?? 'Unspecified plan',
      amount: ipn.price_amount,
      currency: ipn.price_currency,
    });
  }
}

/**
 * Record failed payment (IPN status=failed/expired/refunded)
 * Idempotent: skips if payment_id already recorded
 */
export async function handleIpnPaymentFailed(
  ipn: NowPaymentsIpnPayload,
  paymentService: PaymentService
): Promise<void> {
  const existing = await paymentService.getPaymentByProviderId(ipn.payment_id);
  if (existing) return;

  await paymentService.recordPaymentFailed(
    ipn.payment_id,
    ipn.order_id || '',
    ipn.price_amount,
    ipn.price_currency,
    ipn.invoice_id
  );
}
