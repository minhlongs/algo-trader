/**
 * Marketplace Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketplaceService } from '../services/marketplace.service';

const { mockStrategyRepo, mockListingRepo, mockVettingRepo, mockReviewRepo, mockPerfRepo } = vi.hoisted(() => {
  const mockStrategyRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    findByStatus: vi.fn(),
    findLatestPerformance: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  };
  const mockListingRepo = {
    findById: vi.fn(),
    findByStrategyId: vi.fn(),
    findByStrategyIds: vi.fn().mockResolvedValue([]),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    incrementSubscriberCount: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
  const mockVettingRepo = {
    findById: vi.fn(),
    findByStrategyId: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    complete: vi.fn(),
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
  const mockPerfRepo = {
    findById: vi.fn(),
    findByStrategyAndDate: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    getLatestByStrategy: vi.fn(),
  };
  return { mockStrategyRepo, mockListingRepo, mockVettingRepo, mockReviewRepo, mockPerfRepo };
});

vi.mock('../repositories/strategy-repository', () => {
  const MockStrategyRepo = function () { return mockStrategyRepo; };
  MockStrategyRepo.prototype = mockStrategyRepo;
  return { StrategyRepository: MockStrategyRepo, strategyRepository: mockStrategyRepo };
});

vi.mock('../repositories/listing-repository', () => {
  const MockListingRepo = function () { return mockListingRepo; };
  MockListingRepo.prototype = mockListingRepo;
  return { ListingRepository: MockListingRepo, listingRepository: mockListingRepo };
});

vi.mock('../repositories/vetting-job-repository', () => {
  const MockVettingRepo = function () { return mockVettingRepo; };
  MockVettingRepo.prototype = mockVettingRepo;
  return { VettingJobRepository: MockVettingRepo, vettingJobRepository: mockVettingRepo };
});

vi.mock('../repositories/review-repository', () => {
  const MockReviewRepo = function () { return mockReviewRepo; };
  MockReviewRepo.prototype = mockReviewRepo;
  return { ReviewRepository: MockReviewRepo, reviewRepository: mockReviewRepo };
});

vi.mock('../repositories/performance-repository', () => {
  const MockPerfRepo = function () { return mockPerfRepo; };
  MockPerfRepo.prototype = mockPerfRepo;
  return { PerformanceRepository: MockPerfRepo, performanceRepository: mockPerfRepo };
});

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MarketplaceService();
  });

  const mockStrategy = {
    id: 'strat_001',
    tenantId: 'tenant_001',
    creatorId: 'creator_001',
    name: 'Test Strategy',
    description: 'A test strategy',
    category: 'momentum' as const,
    status: 'draft',
    riskLevel: 5,
    minAllocationUsd: 1000,
    maxAllocationUsd: 50000,
    supportedExchanges: ['binance'],
    tags: ['momentum'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should create a strategy', async () => {
    mockStrategyRepo.create.mockResolvedValue(mockStrategy);
    const result = await service.createStrategy({
      id: 'strat_001',
      tenantId: 'tenant_001',
      creatorId: 'creator_001',
      name: 'Test Strategy',
      description: 'A test strategy',
      category: 'momentum',
      riskLevel: 5,
      minAllocationUsd: 1000,
      maxAllocationUsd: 50000,
      supportedExchanges: ['binance'],
      tags: ['momentum'],
    });
    expect(result.name).toBe('Test Strategy');
    expect(result.status).toBe('draft');
  });

  it('should get strategy by id', async () => {
    mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
    const result = await service.getStrategy('strat_001');
    expect(result).toEqual(mockStrategy);
  });

  it('should return null for nonexistent strategy', async () => {
    mockStrategyRepo.findById.mockResolvedValue(null);
    const result = await service.getStrategy('nonexistent');
    expect(result).toBeNull();
  });

  it('should update strategy when in draft status', async () => {
    mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
    mockStrategyRepo.update.mockResolvedValue({ ...mockStrategy, name: 'Updated' });
    const result = await service.updateStrategy('strat_001', { name: 'Updated' });
    expect(result?.name).toBe('Updated');
  });

  it('should not update strategy when not in draft', async () => {
    mockStrategyRepo.findById.mockResolvedValue({ ...mockStrategy, status: 'approved' });
    const result = await service.updateStrategy('strat_001', { name: 'Updated' });
    expect(result?.status).toBe('approved');
  });

  it('should list strategies with filters', async () => {
    mockStrategyRepo.findAll.mockResolvedValue({
      data: [mockStrategy],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    const result = await service.listStrategies({ status: 'draft' });
    expect(result.data).toHaveLength(1);
    expect(mockStrategyRepo.findAll).toHaveBeenCalledWith(
      { status: 'draft' },
      { page: 1, limit: 20 },
      { field: 'created_at', order: 'desc' }
    );
  });

  it('should create a listing', async () => {
    const mockListing = {
      id: 'listing_001',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      priceUsdMonthly: 5000,
      billingCycle: 'monthly',
      riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
      allowedTenants: [],
      excludedTenants: [],
      isActive: true,
      subscriberCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockListingRepo.create.mockResolvedValue(mockListing);
    const result = await service.createListing({
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      priceUsdMonthly: 5000,
      billingCycle: 'monthly',
      isActive: true,
      status: 'pending',
    });
    expect(result.priceUsdMonthly).toBe(5000);
  });

  it('should queue a vetting job', async () => {
    mockVettingRepo.create.mockResolvedValue({ id: 1, strategyId: 'strat_001', decision: 'queued' });
    const result = await service.queueVettingJob('strat_001');
    expect(result.strategyId).toBe('strat_001');
  });

  it('should return null for nonexistent vetting job', async () => {
    mockVettingRepo.findById.mockResolvedValue(null);
    const result = await service.getVettingJob('999');
    expect(result).toBeNull();
  });

  it('should complete a vetting job and update strategy status', async () => {
    mockVettingRepo.findById.mockResolvedValue({ id: 1, strategyId: 'strat_001', decision: 'queued' });
    mockVettingRepo.complete.mockResolvedValue(undefined);
    mockStrategyRepo.updateStatus.mockResolvedValue({ ...mockStrategy, status: 'approved' });
    const result = await service.completeVettingJob('1', { approved: true, score: 85, feedback: 'Passed' });
    expect(result).toBe(true);
    expect(mockStrategyRepo.updateStatus).toHaveBeenCalledWith('strat_001', 'approved');
  });

  it('should get strategy with details', async () => {
    mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
    mockPerfRepo.getLatestByStrategy.mockResolvedValue([]);
    mockReviewRepo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await service.getStrategyWithDetails('strat_001');
    expect(result?.strategy).toEqual(mockStrategy);
    expect(result?.reviews).toEqual([]);
  });

  it('should return null for nonexistent strategy details', async () => {
    mockStrategyRepo.findById.mockResolvedValue(null);
    const result = await service.getStrategyWithDetails('nonexistent');
    expect(result).toBeNull();
  });

  it('should purchase a strategy', async () => {
    mockStrategyRepo.findById.mockResolvedValue(mockStrategy);
    const result = await service.purchaseStrategy('strat_001', 'user_001');
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
  });

  it('should fail to purchase nonexistent strategy', async () => {
    mockStrategyRepo.findById.mockResolvedValue(null);
    const result = await service.purchaseStrategy('nonexistent', 'user_001');
    expect(result.success).toBe(false);
  });
});
