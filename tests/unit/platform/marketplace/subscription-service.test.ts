/**
 * Subscription Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock postgres-client at the path that audit-log-service.ts actually imports from (../../db/postgres-client)
vi.mock('../../../../src/platform/db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getDbClient: vi.fn(),
  transaction: vi.fn(),
  closeDbConnection: vi.fn(),
}));
// Also mock the shared path that subscription repositories use
vi.mock('../../../../src/shared/db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getDbClient: vi.fn(),
  transaction: vi.fn(),
  closeDbConnection: vi.fn(),
}));

// Mock nowpayments-service to avoid real API calls
// Mock AuditLogService to prevent it from hitting the database
vi.mock('../../../../src/platform/audit/audit-log-service', () => ({
  AuditLogService: class {
    static getInstance() {
      return new (class MockAuditLogService {
        log = vi.fn().mockResolvedValue(undefined);
      })();
    }
  },
}));

const { mockNowPayments, mockNotificationService, mockStrategyRepo } = vi.hoisted(() => ({
  mockNowPayments: {
    createMarketplaceCheckoutUrl: vi.fn().mockResolvedValue(null),
    isMarketplaceOrderId: vi.fn().mockReturnValue(false),
    parseMarketplaceOrderId: vi.fn().mockReturnValue(null),
    getStatusAction: vi.fn().mockReturnValue('ignore'),
    getTierByInvoiceId: vi.fn().mockReturnValue(null),
    verifyWebhook: vi.fn().mockResolvedValue(false),
  },
  mockNotificationService: {
    sendSubscriptionConfirmation: vi.fn().mockResolvedValue(undefined),
  },
  mockStrategyRepo: {
    findById: vi.fn().mockResolvedValue({ id: 'strat_001', creatorId: 'creator_001', name: 'Mock Strategy' }),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    updateStatus: vi.fn(),
    findByStatus: vi.fn().mockResolvedValue([]),
    findLatestPerformance: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../../src/platform/billing/nowpayments-service', () => ({
  NowPaymentsService: {
    getInstance: vi.fn().mockReturnValue(mockNowPayments),
  },
}));

vi.mock('../../../../src/platform/marketplace/notifications/notification-service', () => ({
  NotificationService: {
    getInstance: vi.fn().mockReturnValue(mockNotificationService),
  },
}));

// Mock strategy-repository for dynamic import in strategyRepoForListing
vi.mock('../../../../src/platform/marketplace/repositories/strategy-repository', () => ({
  StrategyRepository: vi.fn().mockImplementation(() => mockStrategyRepo),
  strategyRepository: mockStrategyRepo,
}));

// Mock logger to capture warn/info calls
vi.mock('../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock listing-repository
vi.mock('../../../../src/platform/marketplace/repositories/listing-repository', () => ({
  ListingRepository: vi.fn().mockImplementation(() => mockListingRepo),
  listingRepository: mockListingRepo,
}));

import { SubscriptionService } from '../../../../src/platform/marketplace/services/subscription.service';

const { mockSubRepo, mockReviewRepo: mockSubReviewRepo, mockListingRepo } = vi.hoisted(() => {
  const mockSubRepo = {
    findById: vi.fn(),
    findByPaymentId: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    hasActiveSubscription: vi.fn(),
    findActiveByTenant: vi.fn(),
  };
  const mockReviewRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    incrementHelpful: vi.fn(),
    incrementReported: vi.fn(),
    findBySubscriptionId: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    getAverageRating: vi.fn(),
  };
  const mockListingRepo = {
    findById: vi.fn(),
    findByStrategyId: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    incrementSubscriberCount: vi.fn(),
  };
  const mockStrategyRepo = {
    findById: vi.fn().mockResolvedValue({
      id: 'strat_001',
      creatorId: 'creator_001',
      name: 'Mock Strategy',
    }),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    updateStatus: vi.fn(),
    findByStatus: vi.fn().mockResolvedValue([]),
    findLatestPerformance: vi.fn().mockResolvedValue(null),
  };
  return { mockSubRepo, mockReviewRepo, mockListingRepo, mockStrategyRepo };
});

vi.mock('../../../../src/platform/marketplace/repositories/subscription-repository', () => ({
  SubscriptionRepository: vi.fn().mockImplementation(() => mockSubRepo),
  subscriptionRepository: mockSubRepo,
}));

vi.mock('../../../../src/platform/marketplace/repositories/review-repository', () => ({
  ReviewRepository: vi.fn().mockImplementation(() => mockSubReviewRepo),
  reviewRepository: mockSubReviewRepo,
}));

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubscriptionService();
  });

  const mockSubscription = {
    id: 'sub_001',
    tenantId: 'tenant_001',
    listingId: 'listing_001',
    strategyId: 'strat_001',
    status: 'active',
    allocationPercent: 25,
    customRiskLimits: {},
    currentInvestmentUsd: 10000,
    totalPnlUsd: 500,
    subscriptionStartedAt: new Date('2024-01-01'),
    pausedAt: null,
    cancelledAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockListing = {
    id: 'listing_001',
    strategyId: 'strat_001',
    tenantId: 'tenant_001',
    priceUsdMonthly: 0,
    billingCycle: 'monthly',
    riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
    allowedTenants: [],
    excludedTenants: [],
    isActive: true,
    subscriberCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should subscribe to a free strategy', async () => {
    mockListingRepo.findById.mockResolvedValue(mockListing);
    mockSubRepo.hasActiveSubscription.mockResolvedValue(false);
    mockSubRepo.create.mockResolvedValue(mockSubscription);
    const { subscription, checkoutUrl } = await service.subscribe({
      tenantId: 'tenant_001',
      userId: 'user_001',
      listingId: 'listing_001',
      allocationPercent: 25,
    });
    expect(subscription.id).toBe('sub_001');
    expect(subscription.status).toBe('active');
    expect(checkoutUrl).toBeNull();
  });

  it('should list subscriptions for tenant', async () => {
    mockSubRepo.findAll.mockResolvedValue({
      data: [mockSubscription],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    const result = await service.listSubscriptions('tenant_001');
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should get subscription by id', async () => {
    mockSubRepo.findById.mockResolvedValue(mockSubscription);
    const result = await service.getSubscription('sub_001');
    expect(result).toEqual(mockSubscription);
  });

  it('should return null for nonexistent subscription', async () => {
    mockSubRepo.findById.mockResolvedValue(null);
    const result = await service.getSubscription('nonexistent');
    expect(result).toBeNull();
  });

  it('should update subscription status to paused', async () => {
    mockSubRepo.findById.mockResolvedValue(mockSubscription);
    mockSubRepo.update.mockResolvedValue({ ...mockSubscription, status: 'paused' });
    const result = await service.updateSubscriptionStatus('sub_001', 'pause', 'user_001');
    expect(result?.status).toBe('paused');
  });

  it('should check for active subscription', async () => {
    mockSubRepo.hasActiveSubscription.mockResolvedValue(true);
    const hasActive = await service.hasActiveSubscription('tenant_001', 'strat_001');
    expect(hasActive).toBe(true);
  });

  it('should create a review', async () => {
    const mockReview = {
      id: 'review_001',
      tenantId: 'tenant_001',
      strategyId: 'strat_001',
      subscriptionId: 'sub_001',
      rating: 5,
      comment: 'Great strategy',
      isVerified: true,
      helpfulVotes: 0,
      reportedCount: 0,
      isFlagged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSubReviewRepo.create.mockResolvedValue(mockReview);
    const result = await service.createReview({
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      userId: 'user_001',
      rating: 5,
      comment: 'Great strategy',
    });
    expect(result.rating).toBe(5);
  });

  it('should get review by id', async () => {
    const mockReview = {
      id: 'review_001',
      tenantId: 'tenant_001',
      strategyId: 'strat_001',
      subscriptionId: 'sub_001',
      rating: 5,
      comment: 'Great strategy',
      isVerified: true,
      helpfulVotes: 0,
      reportedCount: 0,
      isFlagged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockSubReviewRepo.findById.mockResolvedValue(mockReview);
    const result = await service.getReview('review_001');
    expect(result?.rating).toBe(5);
  });

  it('should mark review as helpful', async () => {
    mockSubReviewRepo.incrementHelpful.mockResolvedValue(undefined);
    mockSubReviewRepo.findById.mockResolvedValue({
      id: 'review_001',
      tenantId: 'tenant_001',
      strategyId: 'strat_001',
      subscriptionId: 'sub_001',
      rating: 5,
      comment: 'Great',
      isVerified: true,
      helpfulVotes: 1,
      reportedCount: 0,
      isFlagged: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.markReviewHelpful('review_001');
    expect(result).toBeDefined();
    expect(mockSubReviewRepo.incrementHelpful).toHaveBeenCalledWith('review_001');
  });

  it('should flag a review', async () => {
    mockSubReviewRepo.incrementReported.mockResolvedValue(undefined);
    mockSubReviewRepo.update.mockResolvedValue({
      id: 'review_001',
      tenantId: 'tenant_001',
      strategyId: 'strat_001',
      subscriptionId: 'sub_001',
      rating: 5,
      comment: 'Great',
      isVerified: true,
      helpfulVotes: 0,
      reportedCount: 1,
      isFlagged: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.flagReview('review_001');
    expect(result?.isFlagged).toBe(true);
  });

  // ── subscribe: error paths ──────────────────────────────────────────

  it('throws when listing is not found', async () => {
    mockListingRepo.findById.mockResolvedValue(null);
    await expect(
      service.subscribe({ tenantId: 't-1', userId: 'u-1', listingId: 'L1', allocationPercent: 25 }),
    ).rejects.toThrow('Listing not found');
  });

  it('throws when listing is not active', async () => {
    mockListingRepo.findById.mockResolvedValue({ ...mockListing, isActive: false });
    await expect(
      service.subscribe({ tenantId: 't-1', userId: 'u-1', listingId: 'L1', allocationPercent: 25 }),
    ).rejects.toThrow('Listing is not active');
  });

  it('throws when already subscribed to this strategy', async () => {
    mockListingRepo.findById.mockResolvedValue(mockListing);
    mockSubRepo.hasActiveSubscription.mockResolvedValue(true);
    await expect(
      service.subscribe({ tenantId: 't-1', userId: 'u-1', listingId: 'L1', allocationPercent: 25 }),
    ).rejects.toThrow('Already subscribed to this strategy');
  });

  // ── subscribe: paid path ────────────────────────────────────────────

  it('creates checkout URL for paid listing', async () => {
    const paidListing = { ...mockListing, priceUsdMonthly: 5000 };
    mockListingRepo.findById.mockResolvedValue(paidListing);
    mockSubRepo.hasActiveSubscription.mockResolvedValue(false);
    mockSubRepo.create.mockResolvedValue(mockSubscription);
    mockNowPayments.createMarketplaceCheckoutUrl.mockResolvedValue({
      paymentId: 'pay_1',
      checkoutUrl: 'https://nowpayments.io/checkout/pay_1',
    });

    const { subscription, checkoutUrl } = await service.subscribe({
      tenantId: 't-1',
      userId: 'u-1',
      listingId: 'L1',
      allocationPercent: 25,
    });

    expect(checkoutUrl).toBe('https://nowpayments.io/checkout/pay_1');
    expect(subscription.id).toBe('sub_001');
    expect(mockNowPayments.createMarketplaceCheckoutUrl).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'L1', priceUsd: 50 }),
    );
  });

  it('sends confirmation notification when checkout URL and strategy are present', async () => {
    const paidListing = { ...mockListing, priceUsdMonthly: 5000 };
    mockListingRepo.findById.mockResolvedValue(paidListing);
    mockSubRepo.hasActiveSubscription.mockResolvedValue(false);
    mockSubRepo.create.mockResolvedValue(mockSubscription);
    mockNowPayments.createMarketplaceCheckoutUrl.mockResolvedValue({
      paymentId: 'pay_1',
      checkoutUrl: 'https://nowpayments.io/checkout/pay_1',
    });

    await service.subscribe({
      tenantId: 't-1',
      userId: 'u-1',
      listingId: 'L1',
      allocationPercent: 25,
    });

    expect(mockNotificationService.sendSubscriptionConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub_001',
        buyerId: 't-1',
        sellerId: 'creator_001',
        strategyName: 'Mock Strategy',
      }),
    );
  });

  // ── activateByPaymentId ─────────────────────────────────────────────

  it('activates a pending subscription by payment_id', async () => {
    const pendingSub = { ...mockSubscription, status: 'pending_payment', paymentStatus: 'pending' };
    mockSubRepo.findByPaymentId.mockResolvedValue(pendingSub);
    mockSubRepo.update.mockResolvedValue({ ...pendingSub, status: 'active', paymentStatus: 'paid' });

    const result = await service.activateByPaymentId('pay_1');
    expect(result?.status).toBe('active');
    expect(mockSubRepo.update).toHaveBeenCalledWith('sub_001', { status: 'active', paymentStatus: 'paid' });
    expect(mockListingRepo.incrementSubscriberCount).toHaveBeenCalledWith('listing_001', 1);
  });

  it('returns null when activateByPaymentId finds no subscription', async () => {
    mockSubRepo.findByPaymentId.mockResolvedValue(null);
    const result = await service.activateByPaymentId('missing');
    expect(result).toBeNull();
  });

  it('returns existing sub when already active', async () => {
    mockSubRepo.findByPaymentId.mockResolvedValue(mockSubscription);
    const result = await service.activateByPaymentId('pay_1');
    expect(result).toEqual(mockSubscription);
    expect(mockSubRepo.update).not.toHaveBeenCalled();
  });

  // ── cancelByPaymentId ───────────────────────────────────────────────

  it('cancels a subscription by payment_id', async () => {
    const pendingSub = { ...mockSubscription, status: 'pending_payment', paymentStatus: 'pending' };
    mockSubRepo.findByPaymentId.mockResolvedValue(pendingSub);
    mockSubRepo.update.mockResolvedValue({ ...pendingSub, status: 'cancelled', paymentStatus: 'failed' });

    const result = await service.cancelByPaymentId('pay_1');
    expect(result?.status).toBe('cancelled');
    expect(mockSubRepo.update).toHaveBeenCalledWith('sub_001', { status: 'cancelled', paymentStatus: 'failed' });
  });

  it('returns null when cancelByPaymentId finds no subscription', async () => {
    mockSubRepo.findByPaymentId.mockResolvedValue(null);
    const result = await service.cancelByPaymentId('missing');
    expect(result).toBeNull();
  });

  it('returns existing sub when already cancelled', async () => {
    const cancelledSub = { ...mockSubscription, status: 'cancelled' };
    mockSubRepo.findByPaymentId.mockResolvedValue(cancelledSub);
    const result = await service.cancelByPaymentId('pay_1');
    expect(result).toEqual(cancelledSub);
    expect(mockSubRepo.update).not.toHaveBeenCalled();
  });

  // ── getSubscriptionPerformance ──────────────────────────────────────

  it('returns subscription performance metrics', async () => {
    mockSubRepo.findById.mockResolvedValue(mockSubscription);
    const result = await service.getSubscriptionPerformance('sub_001');
    expect(result).toEqual({ totalPnlUsd: 500, winRate: 0, totalTrades: 0 });
  });

  it('returns null for nonexistent subscription performance', async () => {
    mockSubRepo.findById.mockResolvedValue(null);
    const result = await service.getSubscriptionPerformance('missing');
    expect(result).toBeNull();
  });

  // ── getSubscriptionByPaymentId / getStrategyForSubscription / getListingForSubscription ──

  it('looks up subscription by payment_id', async () => {
    mockSubRepo.findByPaymentId.mockResolvedValue(mockSubscription);
    const result = await service.getSubscriptionByPaymentId('pay_1');
    expect(result).toEqual(mockSubscription);
  });

  it('gets listing metadata for a subscription', async () => {
    mockListingRepo.findById.mockResolvedValue(mockListing);
    const result = await service.getListingForSubscription('listing_001');
    expect(result).toEqual({ priceUsdMonthly: 0, billingCycle: 'monthly' });
  });

  it('returns null when listing not found for subscription', async () => {
    mockListingRepo.findById.mockResolvedValue(null);
    const result = await service.getListingForSubscription('missing');
    expect(result).toBeNull();
  });

  it('gets strategy metadata for a subscription', async () => {
    const result = await service.getStrategyForSubscription('strat_001');
    expect(result).toEqual({ id: 'strat_001', creatorId: 'creator_001', name: 'Mock Strategy' });
  });

  it('returns null when strategy not found for subscription', async () => {
    mockStrategyRepo.findById.mockResolvedValue(null);
    const result = await service.getStrategyForSubscription('missing');
    expect(result).toBeNull();
  });

  // ── singleton ──────────────────────────────────────────────────────

  it('returns the same singleton instance', () => {
    expect(SubscriptionService.getInstance()).toBe(SubscriptionService.getInstance());
  });

  // ── updateSubscriptionStatus ────────────────────────────────────────

  it('updates status to paused', async () => {
    mockSubRepo.findById.mockResolvedValue(mockSubscription);
    mockSubRepo.update.mockResolvedValue({ ...mockSubscription, status: 'paused' });
    const result = await service.updateSubscriptionStatus('sub_001', 'pause', 'user_001');
    expect(result?.status).toBe('paused');
    expect(mockSubRepo.update).toHaveBeenCalledWith('sub_001', { status: 'paused' });
  });

  it('updates status to active (resume)', async () => {
    mockSubRepo.findById.mockResolvedValue(mockSubscription);
    mockSubRepo.update.mockResolvedValue({ ...mockSubscription, status: 'active' });
    const result = await service.updateSubscriptionStatus('sub_001', 'resume', 'user_001');
    expect(result?.status).toBe('active');
    expect(mockSubRepo.update).toHaveBeenCalledWith('sub_001', { status: 'active' });
  });

  it('updates status to cancelled', async () => {
    mockSubRepo.findById.mockResolvedValue(mockSubscription);
    mockSubRepo.update.mockResolvedValue({ ...mockSubscription, status: 'cancelled' });
    const result = await service.updateSubscriptionStatus('sub_001', 'cancel', 'user_001');
    expect(result?.status).toBe('cancelled');
    expect(mockSubRepo.update).toHaveBeenCalledWith('sub_001', { status: 'cancelled' });
  });

  it('returns null when update finds no matching subscription', async () => {
    mockSubRepo.update.mockResolvedValue(null);
    const result = await service.updateSubscriptionStatus('missing', 'pause', 'user_001');
    expect(result).toBeNull();
    expect(mockSubRepo.update).toHaveBeenCalledWith('missing', { status: 'paused' });
  });
});
