/**
 * Marketplace Service Test Fixtures
 * Hoisted mocks for repository modules — must be imported before MarketplaceService.
 */
import { vi, type Mock } from 'vitest';
import { MarketplaceService } from '../services/marketplace.service.js';

const { mockStrategyRepo, mockListingRepo, mockVettingRepo, mockReviewRepo, mockPerfRepo } = vi.hoisted(() => {
  const makeRepo = (): Record<string, Mock> => ({});
  const mockStrategyRepo = makeRepo();
  mockStrategyRepo.findById = vi.fn();
  mockStrategyRepo.findAll = vi.fn();
  mockStrategyRepo.create = vi.fn();
  mockStrategyRepo.update = vi.fn();
  mockStrategyRepo.updateStatus = vi.fn();
  mockStrategyRepo.findByStatus = vi.fn();
  mockStrategyRepo.findLatestPerformance = vi.fn();
  mockStrategyRepo.count = vi.fn();
  mockStrategyRepo.delete = vi.fn();
  const mockListingRepo = makeRepo();
  mockListingRepo.findById = vi.fn();
  mockListingRepo.findByStrategyId = vi.fn().mockResolvedValue(null);
  mockListingRepo.findAll = vi.fn();
  mockListingRepo.create = vi.fn();
  mockListingRepo.update = vi.fn();
  mockListingRepo.incrementSubscriberCount = vi.fn();
  mockListingRepo.delete = vi.fn();
  mockListingRepo.count = vi.fn();
  const mockVettingRepo = makeRepo();
  mockVettingRepo.findById = vi.fn();
  mockVettingRepo.findByStrategyId = vi.fn().mockResolvedValue(null);
  mockVettingRepo.create = vi.fn();
  mockVettingRepo.findAll = vi.fn();
  mockVettingRepo.count = vi.fn();
  mockVettingRepo.complete = vi.fn();
  const mockReviewRepo = makeRepo();
  mockReviewRepo.findById = vi.fn();
  mockReviewRepo.findAll = vi.fn();
  mockReviewRepo.create = vi.fn();
  mockReviewRepo.update = vi.fn();
  mockReviewRepo.incrementHelpful = vi.fn();
  mockReviewRepo.incrementReported = vi.fn();
  mockReviewRepo.findBySubscriptionId = vi.fn();
  mockReviewRepo.delete = vi.fn();
  mockReviewRepo.count = vi.fn();
  mockReviewRepo.getAverageRating = vi.fn();
  const mockPerfRepo = makeRepo();
  mockPerfRepo.findById = vi.fn();
  mockPerfRepo.findByStrategyAndDate = vi.fn();
  mockPerfRepo.findAll = vi.fn();
  mockPerfRepo.create = vi.fn();
  mockPerfRepo.upsert = vi.fn();
  mockPerfRepo.update = vi.fn();
  mockPerfRepo.delete = vi.fn();
  mockPerfRepo.count = vi.fn();
  mockPerfRepo.getLatestByStrategy = vi.fn();
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

export {
  mockStrategyRepo,
  mockListingRepo,
  mockVettingRepo,
  mockReviewRepo,
  mockPerfRepo,
  mockStrategy,
};
