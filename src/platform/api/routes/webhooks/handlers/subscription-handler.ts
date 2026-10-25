/**
 * NOWPayments Subscription Handler
 * Handle payment lifecycle events from NOWPayments IPN
 */

import { SubscriptionService } from '../../../../billing/subscription-service';
import { LicenseService } from '../../../../billing/license-service';
import { AuditLogService } from '../../../../audit/audit-log-service';
import { NowPaymentsService, NowPaymentsIpnPayload } from '../../../../billing/nowpayments-service';
import { LicenseTier } from '../../../../../shared/types/license';
import { logger } from '../../../../../shared/utils/logger';

/**
 * Raised when a settled payment cannot be resolved to a license tier from the
 * invoice mapping. Previously the handler silently defaulted to PRO, so a customer
 * who paid for MASTER ($999) but whose `invoice_id` did not map received PRO — a
 * silent under-grant on the money path. Now it fails closed and the provider retries.
 */
export class TierNotResolvedError extends Error {
  readonly invoiceId: string | undefined;

  constructor(invoiceId: string | undefined) {
    super(
      `No license tier resolves for invoice_id=${invoiceId ?? '<missing>'}; ` +
        'refusing to fall back to a tier the customer did not pay for',
    );
    this.name = 'TierNotResolvedError';
    this.invoiceId = invoiceId;
  }
}

/** Type predicate so the mounted price-book tier narrows to LicenseTier without a cast. */
function isLicenseTier(value: string): value is LicenseTier {
  return Object.values(LicenseTier).includes(value as LicenseTier);
}

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
  // Determine tier from invoice ID. Fail closed: an unmapped invoice grants nothing.
  const tierConfig = ipn.invoice_id
    ? nowpaymentsService.getTierByInvoiceId(ipn.invoice_id)
    : null;
  if (!tierConfig?.tier) {
    logger.error('[LicensePayment] Invoice does not map to a license tier — no tier granted', {
      invoiceId: ipn.invoice_id,
      paymentId: ipn.payment_id,
      amount: ipn.price_amount,
    });
    throw new TierNotResolvedError(ipn.invoice_id);
  }
  // A signals invoice configured on the same dashboard must never be granted as a
  // platform license tier: the two channels have separate price books and the
  // `SIGNALS_*` names are not LicenseTier members.
  if (!isLicenseTier(tierConfig.tier)) {
    logger.error('[LicensePayment] Invoice maps to a signals plan, not a license tier — no license granted', {
      invoiceId: ipn.invoice_id,
      resolvedTier: tierConfig.tier,
      paymentId: ipn.payment_id,
    });
    throw new TierNotResolvedError(ipn.invoice_id);
  }
  // Narrowed by isLicenseTier; the invoice config stores the tier as a plain string.
  const tier: LicenseTier = tierConfig.tier;

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
    tier,
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
