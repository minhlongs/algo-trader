/**
 * Deep unit test for Marketplace Listing & Lifecycle Operations
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createMarketplaceListing,
  getMarketplaceListing,
  updateMarketplaceListing,
  queueMarketplaceVettingJob,
  getMarketplaceVettingJob,
  completeMarketplaceVettingJob,
  getMarketplaceStrategyPerformance,
  updateMarketplaceStrategyPerformance,
  getMarketplaceReviews,
  addMarketplaceReview,
  purchaseMarketplaceStrategy,
} from '../../../../src/platform/marketplace/services/marketplace-listing-ops';

describe('Marketplace Listing Ops Deep Coverage', () => {
  const mockListingRepo = {
    create: vi.fn().mockImplementation(async (data) => ({ ...data })),
    findById: vi.fn(),
    update: vi.fn(),
  };

  const mockVettingRepo = {
    create: vi.fn(),
    findById: vi.fn(),
    complete: vi.fn(),
  };

  const mockStrategyRepo = {
    findById: vi.fn(),
    updateStatus: vi.fn(),
  };

  const mockPerfRepo = {
    getLatestByStrategy: vi.fn(),
    upsert: vi.fn(),
  };

  const mockReviewRepo = {
    findAll: vi.fn(),
    create: vi.fn().mockImplementation(async (data) => ({ ...data })),
  };

  const mockNotificationService = {
    sendPayoutNotification: vi.fn(),
  };

  describe('createMarketplaceListing, getMarketplaceListing, updateMarketplaceListing', () => {
    it('creates listing with riskLimits and defaults', async () => {
      const listing = await createMarketplaceListing(mockListingRepo as any, {
        strategyId: 'strat-1',
        tenantId: 'tenant-1',
        priceUsdMonthly: 99,
        billingCycle: 'monthly',
        isActive: true,
        status: 'active',
      });
      expect(listing.id).toContain('listing_');
      expect(listing.priceUsdMonthly).toBe(99);
      expect(listing.riskLimits.maxDailyLossPercent).toBe(10);
    });

    it('gets listing by id', async () => {
      mockListingRepo.findById.mockResolvedValueOnce({ id: 'l1' });
      expect(await getMarketplaceListing(mockListingRepo as any, 'l1')).toEqual({ id: 'l1' });
    });

    it('updates listing by id', async () => {
      mockListingRepo.update.mockResolvedValueOnce({ id: 'l1', isActive: false });
      expect(await updateMarketplaceListing(mockListingRepo as any, 'l1', { isActive: false })).toEqual({
        id: 'l1',
        isActive: false,
      });
    });
  });

  describe('queue, get, and complete vetting job', () => {
    it('queues a vetting job', async () => {
      mockVettingRepo.create.mockResolvedValueOnce({ id: 101, strategyId: 'strat-1', decision: 'queued' });
      const job = await queueMarketplaceVettingJob(mockVettingRepo as any, 'strat-1');
      expect(job.id).toBe('101');
      expect(job.status).toBe('queued');
    });

    it('returns null when vetting job is not found', async () => {
      mockVettingRepo.findById.mockResolvedValueOnce(null);
      expect(await getMarketplaceVettingJob(mockVettingRepo as any, '999')).toBeNull();
    });

    it('returns vetting job details when found', async () => {
      mockVettingRepo.findById.mockResolvedValueOnce({ id: 101, strategyId: 's1', decision: 'in_progress' });
      const job = await getMarketplaceVettingJob(mockVettingRepo as any, '101');
      expect(job).toEqual({ id: '101', strategyId: 's1', status: 'in_progress' });
    });

    it('returns false when completing nonexistent vetting job', async () => {
      mockVettingRepo.findById.mockResolvedValueOnce(null);
      const res = await completeMarketplaceVettingJob(
        mockVettingRepo as any,
        mockStrategyRepo as any,
        '999',
        { approved: true, score: 95, feedback: 'Great' }
      );
      expect(res).toBe(false);
    });

    it('completes job with approved decision and updates strategy status to approved', async () => {
      mockVettingRepo.findById.mockResolvedValueOnce({ id: 101, strategyId: 's1' });
      const res = await completeMarketplaceVettingJob(
        mockVettingRepo as any,
        mockStrategyRepo as any,
        '101',
        { approved: true, score: 90, feedback: 'LGTM' }
      );
      expect(res).toBe(true);
      expect(mockVettingRepo.complete).toHaveBeenCalledWith(101, { approved: true, score: 90, feedback: 'LGTM' });
      expect(mockStrategyRepo.updateStatus).toHaveBeenCalledWith('s1', 'approved');
    });

    it('completes job with rejected decision and updates strategy status to rejected', async () => {
      mockVettingRepo.findById.mockResolvedValueOnce({ id: 102, strategyId: 's2' });
      const res = await completeMarketplaceVettingJob(
        mockVettingRepo as any,
        mockStrategyRepo as any,
        '102',
        { approved: false, score: 40, feedback: 'High drawdown' }
      );
      expect(res).toBe(true);
      expect(mockVettingRepo.complete).toHaveBeenCalledWith(102, { approved: false, score: 40, feedback: 'High drawdown' });
      expect(mockStrategyRepo.updateStatus).toHaveBeenCalledWith('s2', 'rejected');
    });
  });

  describe('performance handlers', () => {
    it('returns null when performances array is empty, otherwise returns first item', async () => {
      mockPerfRepo.getLatestByStrategy.mockResolvedValueOnce([]);
      expect(await getMarketplaceStrategyPerformance(mockPerfRepo as any, 's1')).toBeNull();

      mockPerfRepo.getLatestByStrategy.mockResolvedValueOnce([{ totalPnlUsd: 1200 }]);
      expect(await getMarketplaceStrategyPerformance(mockPerfRepo as any, 's1')).toEqual({ totalPnlUsd: 1200 });
    });

    it('updates performance with empty previous history (exercises all fallback branches)', async () => {
      mockPerfRepo.getLatestByStrategy.mockResolvedValueOnce([]);
      await updateMarketplaceStrategyPerformance(mockPerfRepo as any, 's1', {});

      expect(mockPerfRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 's1',
          totalPnlUsd: 0,
          totalTrades: 0,
          sharpeRatio: undefined,
          maxDrawdown: undefined,
          winRate: undefined,
          winningTrades: 0,
          losingTrades: 0,
        })
      );
    });

    it('updates performance merging with previous history when partial perf given', async () => {
      mockPerfRepo.getLatestByStrategy.mockResolvedValueOnce([
        {
          totalPnlUsd: 500,
          totalTrades: 20,
          sharpeRatio: 1.8,
          maxDrawdown: 0.12,
          winRate: 0.65,
          winningTrades: 13,
          losingTrades: 7,
        },
      ]);

      await updateMarketplaceStrategyPerformance(mockPerfRepo as any, 's1', {
        totalPnlUsd: 600,
        totalTrades: 25,
      });

      expect(mockPerfRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 's1',
          totalPnlUsd: 600,
          totalTrades: 25,
          sharpeRatio: 1.8,
          maxDrawdown: 0.12,
          winRate: 0.65,
          winningTrades: 13,
          losingTrades: 7,
        })
      );
    });
  });

  describe('reviews & purchase', () => {
    it('gets marketplace reviews', async () => {
      mockReviewRepo.findAll.mockResolvedValueOnce({ data: [{ id: 'r1' }] });
      const reviews = await getMarketplaceReviews(mockReviewRepo as any, 's1');
      expect(reviews).toEqual([{ id: 'r1' }]);
    });

    it('adds marketplace review with default isVerified true when undefined', async () => {
      const review = await addMarketplaceReview(mockReviewRepo as any, {
        tenantId: 't1',
        strategyId: 's1',
        subscriptionId: 'sub-1',
        rating: 5,
        comment: 'Great alpha',
      });
      expect(review.isVerified).toBe(true);
    });

    it('adds marketplace review with explicit isVerified false', async () => {
      const review = await addMarketplaceReview(mockReviewRepo as any, {
        tenantId: 't1',
        strategyId: 's1',
        subscriptionId: 'sub-1',
        rating: 3,
        comment: 'Okay alpha',
        isVerified: false,
      });
      expect(review.isVerified).toBe(false);
    });

    it('returns success: false when strategy not found in purchase', async () => {
      mockStrategyRepo.findById.mockResolvedValueOnce(null);
      const res = await purchaseMarketplaceStrategy(
        mockStrategyRepo as any,
        mockNotificationService as any,
        's-missing',
        'u1'
      );
      expect(res).toEqual({ success: false });
    });

    it('completes purchase and sends notification when strategy is found', async () => {
      mockStrategyRepo.findById.mockResolvedValueOnce({
        id: 's1',
        creatorId: 'c1',
        name: 'Alpha Strategy',
      });

      const res = await purchaseMarketplaceStrategy(
        mockStrategyRepo as any,
        mockNotificationService as any,
        's1',
        'u1'
      );
      expect(res.success).toBe(true);
      expect(res.transactionId).toBeDefined();
      expect(mockNotificationService.sendPayoutNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorId: 'c1',
          strategyName: 'Alpha Strategy',
        })
      );
    });
  });
});
