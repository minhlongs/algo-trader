/**
 * Review Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewRepository } from '../repositories/review-repository';
import type { IMarketplaceReview } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../../shared/db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('ReviewRepository', () => {
  let repo: ReviewRepository;

  beforeEach(() => {
    repo = new ReviewRepository();
    mockQuery.mockClear();
  });

  const mockReview: IMarketplaceReview = {
    id: 'review_001',
    tenantId: 'tenant_001',
    strategyId: 'strat_001',
    subscriptionId: 'sub_001',
    rating: 5,
    comment: 'Excellent strategy',
    isVerified: true,
    helpfulVotes: 10,
    reportedCount: 0,
    isFlagged: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should find review by id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockReview] });
    const result = await repo.findById('review_001');
    expect(result).toEqual(mockReview);
  });

  it('should create a review', async () => {
    mockQuery.mockResolvedValue({ rows: [mockReview] });
    const result = await repo.create({
      id: 'review_001',
      tenantId: 'tenant_001',
      strategyId: 'strat_001',
      subscriptionId: 'sub_001',
      rating: 5,
      comment: 'Excellent strategy',
      isVerified: true,
    });
    expect(result.rating).toBe(5);
  });

  it('should increment helpful votes', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await repo.incrementHelpful('review_001');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('helpful_votes = helpful_votes + 1'),
      ['review_001']
    );
  });

  it('should increment reported count', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await repo.incrementReported('review_001');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('reported_count = reported_count + 1'),
      ['review_001']
    );
  });

  it('should get average rating for strategy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ avg: '4.5', count: '10' }] });
    const result = await repo.getAverageRating('strat_001');
    expect(result.avg).toBeCloseTo(4.5);
    expect(result.count).toBe(10);
  });

  it('should find review by subscription id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockReview] });
    const result = await repo.findBySubscriptionId('sub_001');
    expect(result?.id).toBe('review_001');
  });

  it('should delete a review', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete('review_001');
    expect(result).toBe(true);
  });
});
