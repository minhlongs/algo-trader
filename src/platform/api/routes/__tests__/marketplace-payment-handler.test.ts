/**
 * Marketplace Payment Handler — Integration Tests
 *
 * Tests NOWPayments IPN → marketplace activation/revenue pipeline.
 * Mocks external services; exercises real handler logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions — Vitest evaluates vi.mock before any imports
const mocks = vi.hoisted(() => ({
  activateByPaymentId: vi.fn(),
  cancelByPaymentId: vi.fn(),
  getSubscriptionByPaymentId: vi.fn(),
  getStrategyForSubscription: vi.fn(),
  getListingForSubscription: vi.fn(),
  requestPayout: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../../../marketplace/services/subscription.service', () => ({
  SubscriptionService: {
    getInstance: () => ({
      activateByPaymentId: mocks.activateByPaymentId,
      cancelByPaymentId: mocks.cancelByPaymentId,
      getSubscriptionByPaymentId: mocks.getSubscriptionByPaymentId,
      getStrategyForSubscription: mocks.getStrategyForSubscription,
      getListingForSubscription: mocks.getListingForSubscription,
    }),
  },
}));

vi.mock('../../../marketplace/services/revenue.service', () => ({
  RevenueService: {
    getInstance: () => ({
      requestPayout: mocks.requestPayout,
    }),
  },
}));

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: mocks.auditLog,
    }),
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  handleMarketplaceIpnFinished,
  handleMarketplaceIpnCancelled,
} from '../webhooks/handlers/marketplace-payment-handler';

function fakeIpn(overrides: Record<string, unknown> = {}) {
  return {
    payment_id: 'pay_123',
    order_id: 'mp_listing001_tenant00_1700000000000',
    pay_amount: 29.99,
    price_amount: 29.99,
    price_currency: 'usdttrc20',
    pay_currency: 'usdttrc20',
    payment_status: 'finished',
    actually_paid: 29.99,
    outcome_amount: 29.99,
    outcome_currency: 'usdttrc20',
    ...overrides,
  } as any;
}

function fakeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_001', tenantId: 'tenant_001', listingId: 'listing_001', strategyId: 'strat_001',
    status: 'active', paymentId: 'pay_123', paymentStatus: 'paid',
    allocationPercent: 25, currentInvestmentUsd: 0, totalPnlUsd: 0,
    ...overrides,
  };
}

const mockNowpayments = {
  parseMarketplaceOrderId: vi.fn().mockReturnValue({
    listingId: 'listing_001', tenantIdPrefix: 'tenant_00', timestamp: 1700000000000,
  }),
} as any;

describe('Marketplace Payment Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditLog.mockResolvedValue(undefined);
  });

  describe('handleMarketplaceIpnFinished', () => {
    it('activates subscription and creates revenue share on payment finished', async () => {
      mocks.getSubscriptionByPaymentId.mockResolvedValue(null);
      mocks.activateByPaymentId.mockResolvedValue(fakeSubscription());
      mocks.getStrategyForSubscription.mockResolvedValue({ creatorId: 'creator_001' });
      mocks.getListingForSubscription.mockResolvedValue({ priceUsdMonthly: 2999 });

      await handleMarketplaceIpnFinished(fakeIpn(), mockNowpayments);

      expect(mocks.activateByPaymentId).toHaveBeenCalledWith('pay_123');
      expect(mocks.requestPayout).toHaveBeenCalled();
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('is idempotent — skips already-active subscription', async () => {
      mocks.getSubscriptionByPaymentId.mockResolvedValue(fakeSubscription());

      await handleMarketplaceIpnFinished(fakeIpn(), mockNowpayments);

      expect(mocks.activateByPaymentId).not.toHaveBeenCalled();
      expect(mocks.requestPayout).not.toHaveBeenCalled();
    });

    it('skips revenue share when price is zero', async () => {
      mocks.getSubscriptionByPaymentId.mockResolvedValue(null);
      mocks.activateByPaymentId.mockResolvedValue(fakeSubscription());
      mocks.getStrategyForSubscription.mockResolvedValue({ creatorId: 'creator_001' });
      mocks.getListingForSubscription.mockResolvedValue({ priceUsdMonthly: 0 });

      await handleMarketplaceIpnFinished(fakeIpn(), mockNowpayments);

      expect(mocks.activateByPaymentId).toHaveBeenCalled();
      expect(mocks.requestPayout).not.toHaveBeenCalled();
    });
  });

  describe('handleMarketplaceIpnCancelled', () => {
    it('cancels subscription on IPN refunded', async () => {
      mocks.cancelByPaymentId.mockResolvedValue(fakeSubscription({ status: 'cancelled', paymentStatus: 'failed' }));

      await handleMarketplaceIpnCancelled(fakeIpn({ payment_status: 'refunded' }));

      expect(mocks.cancelByPaymentId).toHaveBeenCalledWith('pay_123');
      expect(mocks.auditLog).toHaveBeenCalled();
    });

    it('no-ops when no subscription to cancel', async () => {
      mocks.cancelByPaymentId.mockResolvedValue(null);

      await handleMarketplaceIpnCancelled(fakeIpn());

      expect(mocks.cancelByPaymentId).toHaveBeenCalledWith('pay_123');
      expect(mocks.auditLog).not.toHaveBeenCalled();
    });
  });
});
