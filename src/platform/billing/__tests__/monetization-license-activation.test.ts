/**
 * Monetization End-to-End — both money channels into one entitlement.
 *
 * License activation fails closed on an unmapped invoice: a payment that maps to no
 * license tier grants nothing, and does not fall back to a higher tier.
 *
 * The mocked boundary lives in `monetization-e2e.fixtures.ts`: the database pool
 * (`pg`) and the outbound HTTP provider call (`fetch`). The tier resolution is the
 * behaviour under test, so its real modules run unmodified.
 */

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './monetization-e2e.fixtures';

// Payment ledger persistence: keep the real in-memory Map, drop the disk write.
vi.mock('../payment-store', () => ({
  saveToFile: vi.fn(),
  loadFromFile: vi.fn(() => new Map()),
  clearStoreFile: vi.fn(),
  STORE_PATH: '/tmp/unused-payments.json',
}));

import { PRICING_TIERS } from '../pricing-tiers';
import { PaymentService } from '../payment-service';

/** The payment ledger is a process-wide singleton; reset it between tests. */
function resetPaymentLedger(): void {
  const ledger = (PaymentService.getInstance() as unknown as { payments: Map<string, unknown> })
    .payments;
  ledger.clear();
}

function licenseFinishedIpn(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay-lic-1',
    payment_status: 'finished' as const,
    price_amount: PRICING_TIERS.MASTER.price,
    price_currency: 'usd',
    order_id: 'algotrade_paid-customer@example.com_1700000000',
    invoice_id: 'np-inv-master-001',
    ...overrides,
  };
}

describe('license activation fails closed on an unmapped invoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    resetPaymentLedger();
  });

  it('does not fall back to PRO when the invoice maps to no tier', async () => {
    const { handleIpnFinished, TierNotResolvedError } = await import(
      '../../api/routes/webhooks/handlers/subscription-handler'
    );

    const subscriptionService = {
      getSubscriptionByProviderId: vi.fn().mockResolvedValue(null),
      createSubscription: vi.fn(),
      activateSubscription: vi.fn(),
      updateSubscriptionTier: vi.fn(),
    };
    const nowpaymentsService = {
      getTierByInvoiceId: vi.fn().mockReturnValue(null),
      parseCustomerRef: vi.fn().mockReturnValue('paid-customer@example.com'),
    };
    const licenseService = { generateLicense: vi.fn(), getLicenseByKey: vi.fn() };
    const auditService = { log: vi.fn() };

    // A customer who paid MASTER (999) but whose invoice does not map must NOT receive PRO.
    await expect(
      handleIpnFinished(
        licenseFinishedIpn({ invoice_id: 'unmapped-invoice-id' }) as never,
        nowpaymentsService as never,
        subscriptionService as never,
        licenseService as never,
        auditService as never,
      ),
    ).rejects.toBeInstanceOf(TierNotResolvedError);

    expect(subscriptionService.createSubscription).not.toHaveBeenCalled();
    expect(licenseService.generateLicense).not.toHaveBeenCalled();
    expect(subscriptionService.updateSubscriptionTier).not.toHaveBeenCalled();
  });

  it('does not grant a platform license for a signals invoice on the same dashboard', async () => {
    const { handleIpnFinished, TierNotResolvedError } = await import(
      '../../api/routes/webhooks/handlers/subscription-handler'
    );

    const subscriptionService = {
      getSubscriptionByProviderId: vi.fn().mockResolvedValue(null),
      createSubscription: vi.fn(),
      activateSubscription: vi.fn(),
      updateSubscriptionTier: vi.fn(),
    };
    const nowpaymentsService = {
      getTierByInvoiceId: vi.fn().mockReturnValue({ tier: 'SIGNALS_BASIC', price: 29 }),
      parseCustomerRef: vi.fn().mockReturnValue('paid-customer@example.com'),
    };
    const licenseService = { generateLicense: vi.fn(), getLicenseByKey: vi.fn() };
    const auditService = { log: vi.fn() };

    await expect(
      handleIpnFinished(
        licenseFinishedIpn({ invoice_id: 'np-inv-sig-basic-001', price_amount: 29 }) as never,
        nowpaymentsService as never,
        subscriptionService as never,
        licenseService as never,
        auditService as never,
      ),
    ).rejects.toBeInstanceOf(TierNotResolvedError);

    expect(licenseService.generateLicense).not.toHaveBeenCalled();
  });

  it('activates normally when the invoice maps to a real license tier', async () => {
    const { handleIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/subscription-handler'
    );

    const subscriptionService = {
      getSubscriptionByProviderId: vi.fn().mockResolvedValue(null),
      createSubscription: vi.fn().mockResolvedValue({ id: 'sub-1' }),
      activateSubscription: vi.fn().mockResolvedValue(undefined),
      updateSubscriptionTier: vi.fn(),
    };
    const nowpaymentsService = {
      getTierByInvoiceId: vi.fn().mockReturnValue({ tier: 'MASTER', price: 999 }),
      parseCustomerRef: vi.fn().mockReturnValue('paid-customer@example.com'),
    };
    const licenseService = {
      generateLicense: vi.fn().mockReturnValue('LIC-KEY'),
      getLicenseByKey: vi.fn().mockReturnValue({ key: 'LIC-KEY' }),
    };
    const auditService = { log: vi.fn() };

    await handleIpnFinished(
      licenseFinishedIpn({ invoice_id: 'np-inv-master-001' }) as never,
      nowpaymentsService as never,
      subscriptionService as never,
      licenseService as never,
      auditService as never,
    );

    expect(licenseService.generateLicense).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'MASTER' }),
    );
    expect(subscriptionService.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'MASTER', amount: PRICING_TIERS.MASTER.price }),
    );
  });
});
