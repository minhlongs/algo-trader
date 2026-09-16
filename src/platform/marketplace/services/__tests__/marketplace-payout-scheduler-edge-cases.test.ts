/**
 * Marketplace Payout Scheduler Tests — Edge Cases & Manual Processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NowPaymentsService } from '../../../billing/nowpayments-service';
import { MarketplacePayoutScheduler } from '../marketplace-payout-scheduler';
import { mockPendingShare, mockPendingShareDetail, mockStrategy } from './marketplace-payout-scheduler.fixtures';

const state: { capturedProcessor: ((job: unknown) => Promise<{ processed: number; errors?: unknown[] }>) | null } = { capturedProcessor: null };
const mocks = {
  mockFindAll: vi.fn(),
  mockFindById: vi.fn(),
  mockMarkAsPaid: vi.fn(),
  mockStrategyFindById: vi.fn(),
  mockCreatePayout: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockUpsertJobScheduler: vi.fn(),
  mockGetJobCounts: vi.fn(),
  mockQueueClose: vi.fn(),
};
const mockNPInstance: { createPayout: ReturnType<typeof vi.fn> } = { createPayout: vi.fn() };

vi.mock('bullmq', () => ({
  Queue: class {
    add = mocks.mockQueueAdd;
    upsertJobScheduler = mocks.mockUpsertJobScheduler;
    getJobCounts = mocks.mockGetJobCounts;
    close = mocks.mockQueueClose;
  },
  Worker: class {
    constructor(_n: string, processor: (job: unknown) => Promise<{ processed: number; errors?: unknown[] }>) { state.capturedProcessor = processor; }
  },
}));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../repositories/revenue-share-repository', () => ({
  revenueShareRepository: {
    findAll: (...args: unknown[]) => mocks.mockFindAll(...args),
    findById: (...args: unknown[]) => mocks.mockFindById(...args),
    markAsPaid: (...args: unknown[]) => mocks.mockMarkAsPaid(...args),
  },
}));
vi.mock('../../repositories/strategy-repository', () => ({
  StrategyRepository: class {},
  strategyRepository: { findById: (...args: unknown[]) => mocks.mockStrategyFindById(...args) },
}));

describe('MarketplacePayoutScheduler — Edge Cases & Manual Processing', () => {
  let scheduler: MarketplacePayoutScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    state.capturedProcessor = null;
    mockNPInstance.createPayout = mocks.mockCreatePayout;
    mocks.mockCreatePayout.mockResolvedValue({ payoutId: 'payout_001' });
    mocks.mockQueueAdd.mockResolvedValue(undefined);
    mocks.mockGetJobCounts.mockResolvedValue({});
    mocks.mockQueueClose.mockResolvedValue(undefined);
    mocks.mockMarkAsPaid.mockResolvedValue(true);
    vi.spyOn(NowPaymentsService, 'getInstance').mockReturnValue(mockNPInstance as any);
    scheduler = new MarketplacePayoutScheduler();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('worker processor - filters & manual trigger', () => {
    it('skips already-paid records', async () => {
      mocks.mockFindAll.mockResolvedValue({ data: [{ id: 'rev_001', strategyId: 'strat_001', status: 'paid' }], total: 1, page: 1, limit: 500, totalPages: 1 });
      mocks.mockFindById.mockResolvedValue({ id: 'rev_001', strategyId: 'strat_001', status: 'paid' });

      const result = await state.capturedProcessor!({ id: 'job_003', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(mocks.mockMarkAsPaid).not.toHaveBeenCalled();
    });

    it('skips when creator has no payoutAddress', async () => {
      mocks.mockFindAll.mockResolvedValue({ data: [mockPendingShare], total: 1, page: 1, limit: 500, totalPages: 1 });
      mocks.mockFindById.mockResolvedValue(mockPendingShareDetail);
      mocks.mockStrategyFindById.mockResolvedValue({ id: 'strat_001', payoutAddress: null });

      const result = await state.capturedProcessor!({ id: 'job_004', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(mocks.mockCreatePayout).not.toHaveBeenCalled();
      expect(mocks.mockMarkAsPaid).not.toHaveBeenCalled();
    });

    it('no-ops when no pending records exist', async () => {
      mocks.mockFindAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 500, totalPages: 0 });

      const result = await state.capturedProcessor!({ id: 'job_006', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('uses revenueIds from manual trigger job', async () => {
      mocks.mockFindById.mockResolvedValue(mockPendingShareDetail);
      mocks.mockStrategyFindById.mockResolvedValue(mockStrategy);

      const result = await state.capturedProcessor!({
        id: 'job_007',
        data: { manual: true, revenueIds: ['rev_001', 'rev_002'] },
      });

      expect(result.processed).toBe(2);
      expect(mocks.mockFindAll).not.toHaveBeenCalled();
      expect(mocks.mockFindById).toHaveBeenCalledTimes(2);
    });
  });
});
