/**
 * NOWPayments Subscription Handler
 * Handle payment lifecycle events from NOWPayments IPN
 */

import { SubscriptionService } from '../../../../billing/subscription-service';
import { LicenseService } from '../../../../billing/license-service';
import { AuditLogService } from '../../../../audit/audit-log-service';
import { NowPaymentsService, NowPaymentsIpnPayload } from '../../../../billing/nowpayments-service';
import { LicenseTier } from '../../../../../shared/types/license';

/**
 * Handle IPN status=finished → create/activate subscription + license
 */
export async function handleIpnFinished(
  ipn: NowPaymentsIpnPayload,
  nowpaymentsService: NowPaymentsService,
  subscriptionService: SubscriptionService,
  licenseService: LicenseService,
  auditService: AuditLogService
): Promise<void> {
  // Determine tier from invoice ID
  const tierConfig = ipn.invoice_id
    ? nowpaymentsService.getTierByInvoiceId(ipn.invoice_id)
    : null;
  const tier = (tierConfig?.tier as LicenseTier) || LicenseTier.PRO;

  // Customer email: parse from order_id (algotrade_{ref}_{ts}) or use order_id directly if it looks like an email
  let customerEmail: string;
  if (ipn.order_id) {
    const parsed = nowpaymentsService.parseCustomerRef(ipn.order_id);
    customerEmail = parsed || (ipn.order_id.includes('@') ? ipn.order_id : `payment_${ipn.payment_id}`);
  } else {
    customerEmail = `payment_${ipn.payment_id}`;
  }

  // Check idempotency — skip if already processed
  const existing = await subscriptionService.getSubscriptionByProviderId(ipn.payment_id);
  if (existing && existing.status === 'active') return;

  // 30-day subscription period
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Create subscription
  const subscription = await subscriptionService.createSubscription({
    providerPaymentId: ipn.payment_id,
    customerEmail,
    productId: ipn.invoice_id || ipn.payment_id,
    status: 'active',
    tier,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    amount: ipn.price_amount,
    currency: ipn.price_currency,
  });

  // Activate subscription and create linked license
  await subscriptionService.activateSubscription(subscription.id);

  const licenseKey = licenseService.generateLicense({
    userId: customerEmail,
    tier: tier as unknown as string,
    validUntil: periodEnd,
  });
  const license = licenseService.getLicenseByKey(licenseKey);
  // Set licenseId on subscription directly for immediate availability
  if (license) {
    license.subscriptionId = subscription.id;
    await subscriptionService.updateSubscriptionTier(subscription.id, tier, licenseKey);
	}

  await auditService.log(customerEmail, 'created', {
    metadata: {
      eventType: 'nowpayments_finished',
      paymentId: ipn.payment_id,
      tier,
      amount: ipn.price_amount,
    },
  });
}

/**
 * Handle IPN status=refunded → cancel subscription
 */
export async function handleIpnRefunded(
  ipn: NowPaymentsIpnPayload,
  subscriptionService: SubscriptionService
): Promise<void> {
  const subscription = await subscriptionService.getSubscriptionByProviderId(ipn.payment_id);
  if (subscription) {
    await subscriptionService.updateSubscriptionStatus(subscription.id, 'cancelled');
  }
}

/* ── Signals billig redirects ── */
export { handleSignalsIpnFinished, handleSignalsIpnCancelled } from './signals-payment-handler';
