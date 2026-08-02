import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleIpnFinished, handleIpnRefunded } from '../../src/platform/api/routes/webhooks/handlers/subscription-handler';
import { SubscriptionService } from '../../src/platform/billing/subscription-service';
import { LicenseService } from '../../src/platform/billing/license-service';
import { AuditLogService } from '../../src/platform/audit/audit-log-service';
import { NowPaymentsService } from '../../src/platform/billing/nowpayments-service';
import { LicenseTier } from '../../src/shared/types/license';
import type { AuditLog } from '../../src/platform/audit/audit-log-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PRO_INVOICE_ID = 'inv-pro-001';
const ENT_INVOICE_ID = 'inv-ent-001';

type TestServices = {
  nowpaymentsService: NowPaymentsService;
  subscriptionService: SubscriptionService;
  licenseService: LicenseService;
  auditService: AuditLogService;
};

function makeServices(): TestServices {
  return {
    nowpaymentsService: NowPaymentsService.getInstance(),
    subscriptionService: SubscriptionService.getInstance(),
    licenseService: LicenseService.getInstance(),
    auditService: AuditLogService.getInstance(),
  };
}

function makeFinishedIpn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    payment_id: 'pay-12345',
    payment_status: 'finished',
    invoice_id: PRO_INVOICE_ID,
    order_id: 'customer-john@example.com',
    price_amount: 99,
    price_currency: 'usd',
    actually_paid: 98.5,
    pay_currency: 'usdt',
    pay_address: '0xABC',
  };
  return { ...base, ...overrides };
}

function makeRefundedIpn(paymentId: string): Record<string, unknown> {
  return {
    payment_id: paymentId,
    payment_status: 'refunded',
    invoice_id: PRO_INVOICE_ID,
    order_id: 'customer-john@example.com',
    price_amount: 99,
    price_currency: 'usd',
    actually_paid: 98.5,
    pay_currency: 'usdt',
    pay_address: '0xABC',
  };
}

function configureMocks(svc: TestServices, tier: LicenseTier, invoiceId: string): void {
  vi.spyOn(svc.nowpaymentsService, 'verifyWebhook').mockResolvedValue(true);
  vi.spyOn(svc.nowpaymentsService, 'getTierByInvoiceId').mockReturnValue({
    tier,
    invoiceId,
    price: tier === LicenseTier.ENTERPRISE ? 299 : 99,
    currency: 'USD',
    name: tier === LicenseTier.ENTERPRISE ? 'Enterprise' : 'Pro Trader',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NOWPayments IPN Revenue Activation E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SubscriptionService.resetInstance();
    LicenseService.resetInstance();
    AuditLogService.resetInstance();
    const audit = AuditLogService.getInstance();
    vi.spyOn(audit, 'log').mockResolvedValue({ id: 'audit-e2e', event: 'created', createdAt: new Date().toISOString() } as AuditLog);
  });

  // Happy path - PRO tier, first payment
  it('should create subscription + license + bidirectional link on finished IPN (PRO tier)', async () => {
    const svc = makeServices();
    configureMocks(svc, LicenseTier.PRO, PRO_INVOICE_ID);

    const ipn = makeFinishedIpn();
    await handleIpnFinished(ipn, svc.nowpaymentsService, svc.subscriptionService, svc.licenseService, svc.auditService);

    // --- Verify subscription created ---
    const subscription = await svc.subscriptionService.getSubscriptionByProviderId('pay-12345');
    expect(subscription).toBeDefined();
    expect(subscription!.status).toBe('active');
    expect(subscription!.tier).toBe(LicenseTier.PRO);
    expect(subscription!.customerEmail).toBe('customer-john@example.com');
    expect(subscription!.amount).toBe(99);
    expect(subscription!.currentPeriodEnd).toBeDefined();

    // --- Verify license created ---
    expect(subscription!.licenseId).toBeDefined();
    const license = svc.licenseService.getLicenseByKey(subscription!.licenseId!);
    expect(license).toBeDefined();
    expect(license!.tier).toBe('PRO');

    // --- Verify bidirectional link updated ---
    const refreshed = await svc.subscriptionService.getSubscriptionByProviderId('pay-12345');
    expect(refreshed!.licenseId).toBe(subscription!.licenseId);
  });

  // Idempotency - duplicate IPN does not create duplicate subscription
  it('should be idempotent on duplicate finished IPN', async () => {
    const svc = makeServices();
    configureMocks(svc, LicenseTier.PRO, PRO_INVOICE_ID);

    // Use a dedicated payment ID for this test to avoid cross-test collisions
    const ipn = makeFinishedIpn({ payment_id: 'pay-idem-123' });

    // Send IPN twice
    await handleIpnFinished(ipn, svc.nowpaymentsService, svc.subscriptionService, svc.licenseService, svc.auditService);
    await handleIpnFinished(ipn, svc.nowpaymentsService, svc.subscriptionService, svc.licenseService, svc.auditService);

    // Exactly one subscription for this payment_id
    const sub = await svc.subscriptionService.getSubscriptionByProviderId('pay-idem-123');
    expect(sub).toBeDefined();

    // Implicitly: can retrieve the subscription created by this test
    // (use the customer email captured by the handler so we don't match stray state)
    const allByCustomer = await svc.subscriptionService.getSubscriptionsByCustomer('customer-john@example.com');
    const forThisPayment = allByCustomer.filter(s => s.providerPaymentId === 'pay-idem-123');
    expect(forThisPayment).toHaveLength(1);
  });

  // Refund - cancels the subscription created in this test only
  it('should cancel subscription on refunded IPN', async () => {
    const svc = makeServices();
    configureMocks(svc, LicenseTier.PRO, PRO_INVOICE_ID);

    // Use dedicated payment ID so we only cancel what this test created
    const paymentId = 'pay-refund-001';
    const ipn = makeFinishedIpn({ payment_id: paymentId });

    // First: complete the payment
    await handleIpnFinished(ipn, svc.nowpaymentsService, svc.subscriptionService, svc.licenseService, svc.auditService);

    let sub = await svc.subscriptionService.getSubscriptionByProviderId(paymentId);
    expect(sub).toBeDefined();
    expect(sub!.status).toBe('active');

    // Then: refund fires
    await handleIpnRefunded(makeRefundedIpn(paymentId), svc.subscriptionService);

    sub = await svc.subscriptionService.getSubscriptionByProviderId(paymentId);
    expect(sub).toBeDefined();
    expect(sub!.status).toBe('cancelled');
  });

  // ENTERPRISE tier - correct tier resolution from invoice ID
  it('should resolve ENTERPRISE tier from invoice_id and activate correctly', async () => {
    const svc = makeServices();
    configureMocks(svc, LicenseTier.ENTERPRISE, ENT_INVOICE_ID);

    const ipn = makeFinishedIpn({ invoice_id: ENT_INVOICE_ID, payment_id: 'pay-ent-001', price_amount: 299 });
    await handleIpnFinished(ipn, svc.nowpaymentsService, svc.subscriptionService, svc.licenseService, svc.auditService);

    const sub = await svc.subscriptionService.getSubscriptionByProviderId('pay-ent-001');
    expect(sub).toBeDefined();
    expect(sub!.tier).toBe(LicenseTier.ENTERPRISE);
    expect(sub!.amount).toBe(299);
    expect(sub!.licenseId).toBeDefined();
  });

  // Fallback - no invoice_id defaults to PRO
  it('should default to PRO tier when invoice_id is missing', async () => {
    const svc = makeServices();
    // getTierByInvoiceId is only called when invoice_id is truthy; spy by default returns undefined
    const getTierSpy = vi.spyOn(svc.nowpaymentsService, 'getTierByInvoiceId');

    const ipn = makeFinishedIpn({ invoice_id: '', payment_id: 'pay-noinv-001' });
    await handleIpnFinished(ipn, svc.nowpaymentsService, svc.subscriptionService, svc.licenseService, svc.auditService);

    // getTierByInvoiceId should NOT be called when invoice_id is empty
    expect(getTierSpy).not.toHaveBeenCalled();

    const sub = await svc.subscriptionService.getSubscriptionByProviderId('pay-noinv-001');
    expect(sub).toBeDefined();
    expect(sub!.tier).toBe(LicenseTier.PRO); // falls back to PRO
  });
});
