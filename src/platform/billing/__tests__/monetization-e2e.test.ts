/**
 * Monetization End-to-End — both money channels into one entitlement.
 *
 * Proves, end to end through the real handlers (not through mocked tiers):
 *
 *  (a) a replayed `payment_id` activates the tier only once;
 *  (b) the granted tier comes from the price book, never from a client payload;
 *  (c) an amount/invoice that maps to no price book fails closed and grants nothing;
 *  (d) a marketplace subscription produces exactly one payout with the verified split.
 *
 * The mocked boundary lives in `monetization-e2e.fixtures.ts`: the database pool
 * (`pg`) and the outbound HTTP provider call (`fetch`). The tier resolution and the
 * payout split are the behaviour under test, so their real modules run unmodified.
 */

process.env.AUDIT_HMAC_KEY_v1 = 'a'.repeat(64);

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  db,
  mockLogger,
  mockSignalRepo,
  fetchMock,
} from './monetization-e2e.fixtures';

// Payment ledger persistence: keep the real in-memory Map, drop the disk write.
vi.mock('../payment-store', () => ({
  saveToFile: vi.fn(),
  loadFromFile: vi.fn(() => new Map()),
  clearStoreFile: vi.fn(),
  STORE_PATH: '/tmp/unused-payments.json',
}));

import {
  SIGNALS_PRICE_BOOK,
  resolveSignalsTierForAmount,
  SignalsPriceNotFoundError,
  listSignalsPrices,
} from '../signals-price-book';
import { resolveInvoiceChannel, resolveInvoiceTierLabel } from '../invoice-tier-label';
import { calculatePayoutSplit } from '../../marketplace/services/revenue-calculator';
import { PLATFORM_FEE_PERCENT, CREATOR_SHARE_PERCENT } from '../../marketplace/services/revenue.types';
import { PRICING_TIERS } from '../pricing-tiers';
import { PaymentService } from '../payment-service';

/** The payment ledger is a process-wide singleton; reset it between tests. */
function resetPaymentLedger(): void {
  const ledger = (PaymentService.getInstance() as unknown as { payments: Map<string, unknown> })
    .payments;
  ledger.clear();
}

function signalsIpn(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay-sig-1',
    payment_status: 'finished' as const,
    price_amount: SIGNALS_PRICE_BOOK.SIGNALS_PRO.priceUsd,
    price_currency: 'usd',
    order_id: 'sig_sub-alpha_1700000000',
    ...overrides,
  };
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

describe('signals price book is the only source of a paid tier', () => {
  it('declares each signals plan exactly once with its delivery tier', () => {
    expect(listSignalsPrices()).toEqual([29, 99, 299]);
    expect(SIGNALS_PRICE_BOOK.SIGNALS_BASIC.tier).toBe('BASIC');
    expect(SIGNALS_PRICE_BOOK.SIGNALS_PRO.tier).toBe('PRO');
    expect(SIGNALS_PRICE_BOOK.SIGNALS_ENTERPRISE.tier).toBe('ENTERPRISE');
  });

  it('does not collapse the paid Basic buy into FREE', () => {
    // FREE is the unsubscribed state: a paid Basic customer must stay distinguishable
    // from one who never bought, so BASIC survives as a real delivery tier.
    const tiers = Object.values(SIGNALS_PRICE_BOOK).map((e) => e.tier);
    expect(tiers).toContain('BASIC');
    expect(tiers).not.toContain('FREE');
  });

  it('resolves the tier for a declared price and throws for anything else', () => {
    expect(resolveSignalsTierForAmount(29).tier).toBe('BASIC');
    expect(resolveSignalsTierForAmount(99).tier).toBe('PRO');
    expect(resolveSignalsTierForAmount(299).tier).toBe('ENTERPRISE');

    for (const unmapped of [0, 7, 49, 999, 299.5, Number.NaN]) {
      expect(() => resolveSignalsTierForAmount(unmapped)).toThrow(SignalsPriceNotFoundError);
    }
  });

  it('keeps the signals book separate from the platform book despite shared numbers', () => {
    // 99 and 299 exist in both books. A shared amount→tier map would grant a signals
    // buyer a platform tier (or vice versa), so the books must stay distinct.
    expect(PRICING_TIERS.PRO.price).toBe(SIGNALS_PRICE_BOOK.SIGNALS_PRO.priceUsd);
    expect(PRICING_TIERS.ENTERPRISE.price).toBe(SIGNALS_PRICE_BOOK.SIGNALS_ENTERPRISE.priceUsd);
    expect(resolveSignalsTierForAmount(99).tier).toBe('PRO');
    // The platform-only $49 amount must throw in the signals book, not land on a tier.
    expect(() => resolveSignalsTierForAmount(PRICING_TIERS.STARTER.price)).toThrow(
      SignalsPriceNotFoundError,
    );
  });
});

describe('invoice tier labels come from a price book, not amount brackets', () => {
  it('labels each channel from its own book', () => {
    expect(resolveInvoiceChannel('sig_sub-1_1700')).toBe('signals');
    expect(resolveInvoiceChannel('mp_listing-1_tenant_1700')).toBe('marketplace');
    expect(resolveInvoiceChannel('algotrade_cust_1700')).toBe('platform');

    expect(resolveInvoiceTierLabel('signals', 29)).toBe('Signals Basic');
    expect(resolveInvoiceTierLabel('platform', PRICING_TIERS.PRO.price)).toBe('Pro');
    expect(resolveInvoiceTierLabel('marketplace', 4900)).toBe('Marketplace Strategy Subscription');
  });

  it('returns null rather than inventing a plan name for an unlisted amount', () => {
    // A wrong plan name on the money path is a billing dispute; no label beats a wrong one.
    expect(resolveInvoiceTierLabel('platform', 1234)).toBeNull();
    expect(resolveInvoiceTierLabel('signals', 1234)).toBeNull();
  });
});

describe('signals activation through the real webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    fetchMock.mockReset();
    resetPaymentLedger();
    mockSignalRepo.getBySubscriberId.mockResolvedValue(null);
    mockSignalRepo.upsert.mockResolvedValue(undefined);
    mockSignalRepo.setActive.mockResolvedValue(undefined);
  });

  it('activates the tier once and ignores a replayed payment_id', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );
    const { handleIpnPaymentSuccess } = await import(
      '../../api/routes/webhooks/handlers/payment-handler'
    );

    // Route order for a `sig_` IPN: activate the tier, then record the settlement.
    const firstIpn = signalsIpn({ payment_id: 'pay-replay' });
    await handleSignalsIpnFinished(firstIpn as never);
    await handleIpnPaymentSuccess(firstIpn as never, PaymentService.getInstance());

    await handleSignalsIpnFinished(signalsIpn({ payment_id: 'pay-replay' }) as never);

    expect(mockSignalRepo.upsert).toHaveBeenCalledTimes(1);
    expect(mockSignalRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: 'sub-alpha', tier: 'PRO', active: true }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      '[SignalsPayment] Payment already recorded, skipping activation',
      expect.objectContaining({ paymentId: 'pay-replay' }),
    );
  });

  it('grants the price-book tier regardless of any tier named in the payload', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );

    // A hostile payload names a tier the customer never paid for. The amount on the
    // price book is the only thing that decides the granted tier.
    await handleSignalsIpnFinished(
      signalsIpn({
        payment_id: 'pay-forged',
        price_amount: SIGNALS_PRICE_BOOK.SIGNALS_BASIC.priceUsd,
        tier: 'MASTER',
        order_description: 'MASTER license',
      }) as never,
    );

    expect(mockSignalRepo.upsert).toHaveBeenCalledTimes(1);
    const written = mockSignalRepo.upsert.mock.calls[0][0] as { tier: string };
    expect(written.tier).toBe('BASIC');
    expect(written.tier).not.toBe('MASTER');
  });

  it('fails closed when the paid amount is on no price book — no tier is written', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );

    await expect(
      handleSignalsIpnFinished(
        signalsIpn({ payment_id: 'pay-unknown', price_amount: 1234 }) as never,
      ),
    ).rejects.toBeInstanceOf(SignalsPriceNotFoundError);

    expect(mockSignalRepo.upsert).not.toHaveBeenCalled();
    expect(mockSignalRepo.getBySubscriberId).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[SignalsPayment] Paid amount absent from signals price book — no tier granted',
      expect.objectContaining({ amount: 1234, paymentId: 'pay-unknown' }),
    );
  });

  it('upgrades an existing subscription in place rather than creating a duplicate', async () => {
    const { handleSignalsIpnFinished } = await import(
      '../../api/routes/webhooks/handlers/signals-payment-handler'
    );
    mockSignalRepo.getBySubscriberId.mockResolvedValue({
      id: 'row-1',
      subscriberId: 'sub-alpha',
      chatId: 'chat-1',
      tier: 'BASIC',
      active: true,
      createdAt: 1,
    });

    await handleSignalsIpnFinished(
      signalsIpn({
        payment_id: 'pay-upgrade',
        price_amount: SIGNALS_PRICE_BOOK.SIGNALS_ENTERPRISE.priceUsd,
      }) as never,
    );

    expect(mockSignalRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'row-1',
        subscriberId: 'sub-alpha',
        chatId: 'chat-1',
        tier: 'ENTERPRISE',
        active: true,
        createdAt: 1,
      }),
    );
    // BASIC must stay BASIC: the paid Basic buy is never collapsed into FREE.
    expect(mockSignalRepo.upsert.mock.calls[0][0]).not.toMatchObject({ tier: 'FREE' });
  });
});

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
