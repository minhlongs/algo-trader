/**
 * Monetization End-to-End — both money channels into one entitlement.
 *
 * Marketplace channel: one payout at the verified split per settled subscription,
 * and a checkout call that talks HTTP only and prices from the listing.
 *
 * The mocked boundary lives in `monetization-e2e.fixtures.ts`: the database pool
 * (`pg`) and the outbound HTTP provider call (`fetch`). The payout split is the
 * behaviour under test, so its real module runs unmodified.
 */

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  db,
  mockLogger,
  fetchMock,
} from './monetization-e2e.fixtures';

// Payment ledger persistence: keep the real in-memory Map, drop the disk write.
// Reached through PaymentService in resetPaymentLedger, not through the marketplace handlers.
vi.mock('../payment-store', () => ({
  saveToFile: vi.fn(),
  loadFromFile: vi.fn(() => new Map()),
  clearStoreFile: vi.fn(),
  STORE_PATH: '/tmp/unused-payments.json',
}));

import { PaymentService } from '../payment-service';
import { calculatePayoutSplit } from '../../marketplace/services/revenue-calculator';
import { PLATFORM_FEE_PERCENT, CREATOR_SHARE_PERCENT } from '../../marketplace/services/revenue.types';

/** The payment ledger is a process-wide singleton; reset it between tests. */
function resetPaymentLedger(): void {
  const ledger = (PaymentService.getInstance() as unknown as { payments: Map<string, unknown> })
    .payments;
  ledger.clear();
}

function marketplaceIpn(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay-mp-1',
    payment_status: 'finished' as const,
    price_amount: 49,
    price_currency: 'usd',
    order_id: 'mp_listing-1_tenant-buyer_1700000000',
    invoice_id: 'np-inv-mp-001',
    ...overrides,
  };
}

describe('marketplace subscription produces one payout at the verified split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    fetchMock.mockReset();
    resetPaymentLedger();
  });

  it('splits a settled subscription 20% platform / 80% creator', () => {
    const split = calculatePayoutSplit('sub-mp-1', 4900);

    // Verified against revenue.types.ts: PLATFORM_FEE_PERCENT = 0.2 / CREATOR = 0.8.
    expect(PLATFORM_FEE_PERCENT).toBe(0.2);
    expect(CREATOR_SHARE_PERCENT).toBe(0.8);
    expect(split.grossRevenueCents).toBe(4900);
    expect(split.platformShareCents).toBe(980);
    expect(split.creatorShareCents).toBe(3920);
    expect(split.creatorShareCents + split.platformShareCents).toBe(4900);
    expect(split.platformFeePercent).toBe(0.2);
    expect(split.creatorSharePercent).toBe(0.8);
  });

  it('requests exactly one payout, and none for a replayed IPN', async () => {
    const { handleMarketplaceIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/marketplace-payment-handler'
    );
    const { RevenueService } = await import('../../marketplace/services/revenue.service');
    const { SubscriptionService } = await import('../../marketplace/services/subscription.service');

    // The listing price is the marketplace channel's price book, and is what the split
    // is computed from (priceUsdMonthly, in cents). Repositories read camelCase rows.
    db.table('marketplace_strategies').push({ id: 'strategy-1', creatorId: 'tenant-creator' });
    db.table('marketplace_listings').push({ id: 'listing-1', priceUsdMonthly: 4900 });
    db.table('marketplace_subscriptions').push({
      id: 'sub-mp-1',
      tenantId: 'tenant-buyer',
      listingId: 'listing-1',
      strategyId: 'strategy-1',
      status: 'pending_payment',
      paymentId: 'pay-mp-1',
    });

    const requestPayout = vi
      .spyOn(RevenueService.getInstance(), 'requestPayout')
      .mockResolvedValue({ id: 'rev-1' } as never);
    const subscriptionService = SubscriptionService.getInstance();
    const activate = vi.spyOn(subscriptionService, 'activateByPaymentId');
    const getByPaymentId = vi.spyOn(subscriptionService, 'getSubscriptionByPaymentId');

    getByPaymentId.mockResolvedValueOnce({
      id: 'sub-mp-1',
      status: 'pending_payment',
      tenantId: 'tenant-buyer',
      listingId: 'listing-1',
      strategyId: 'strategy-1',
    } as never);
    activate.mockResolvedValueOnce({
      id: 'sub-mp-1',
      tenantId: 'tenant-buyer',
      listingId: 'listing-1',
      strategyId: 'strategy-1',
    } as never);

    await handleMarketplaceIpnFinished(marketplaceIpn({ payment_id: 'pay-mp-1' }) as never, {} as never);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(requestPayout).toHaveBeenCalledTimes(1);
    expect(requestPayout).toHaveBeenCalledWith(
      'tenant-creator',
      4900,
      expect.objectContaining({ subscriptionId: 'sub-mp-1' }),
    );

    // Replayed IPN: the guard sees an already-active subscription and returns before
    // any second payout is requested.
    getByPaymentId.mockResolvedValue({
      id: 'sub-mp-1',
      status: 'active',
      tenantId: 'tenant-buyer',
      listingId: 'listing-1',
      strategyId: 'strategy-1',
    } as never);

    await handleMarketplaceIpnFinished(marketplaceIpn({ payment_id: 'pay-mp-1' }) as never, {} as never);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(requestPayout).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Marketplace subscription already active, skipping',
      expect.objectContaining({ paymentId: 'pay-mp-1' }),
    );
  });
});

describe('marketplace checkout talks HTTP only, and reads the price from the listing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    fetchMock.mockReset();
  });

  it('creates the invoice over fetch with the listing price in USD', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'inv-1', invoice_url: 'https://checkout.example/inv-1', payment_id: 'np-pay-1' }),
      text: async () => '',
    });

    const { createMarketplaceCheckoutUrl } = await import('../../billing/nowpayments-marketplace');
    const result = await createMarketplaceCheckoutUrl('https://api.example/v1', 'test-api-key', {
      listingId: 'listing-1',
      strategyName: 'Momentum Alpha',
      priceUsd: 49,
      tenantId: 'tenant-buyer',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example/v1/invoice');
    const body = JSON.parse(String(init.body));
    expect(body.price_amount).toBe(49);
    expect(body.order_id.startsWith('mp_listing-1_')).toBe(true);
    expect(result).toEqual({
      checkoutUrl: 'https://checkout.example/inv-1',
      paymentId: 'np-pay-1',
    });
  });
});
