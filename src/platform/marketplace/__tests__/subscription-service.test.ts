/**
 * Subscription Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock postgres-client — query returns empty rows by default
vi.mock('../../../shared/db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  getDbClient: vi.fn(),
  transaction: vi.fn(),
  closeDbConnection: vi.fn(),
}));

// Mock listing-repository to avoid extra DB queries in subscribe()
vi.mock('../repositories/listing-repository', () => ({
  ListingRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    findByStrategyId: vi.fn().mockResolvedValue(null),
  })),
  listingRepository: {
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    findByStrategyId: vi.fn().mockResolvedValue(null),
  },
}));

import { SubscriptionService } from '../services/subscription.service';

const { mockSubRepo, mockReviewRepo: mockSubReviewRepo } = vi.hoisted(() => {
  const mockSubRepo = {
    findById: vi.fn(),
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
  return { mockSubRepo, mockReviewRepo };
});

vi.mock('../repositories/subscription-repository', () => ({
  SubscriptionRepository: vi.fn().mockImplementation(() => mockSubRepo),
  subscriptionRepository: mockSubRepo,
}));

vi.mock('../repositories/review-repository', () => ({
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

  it('should subscribe to a strategy', async () => {
    mockSubRepo.create.mockResolvedValue(mockSubscription);
    const result = await service.subscribe({
      tenantId: 'tenant_001',
      userId: 'user_001',
      listingId: 'listing_001',
      allocationPercent: 25,
    });
    expect(result.id).toBe('sub_001');
    expect(result.status).toBe('active');
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
});
