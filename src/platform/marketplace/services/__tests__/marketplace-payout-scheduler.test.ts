/**
 * Marketplace Payout Scheduler — Unit Tests
 *
 * Tests payout processing: find pending → resolve wallet → send USDT → mark paid.
 * Mocks BullMQ Queue/Worker, NOWPayments, and repositories.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the worker processor function for direct testing (hoisted for vi.mock access)
const state = vi.hoisted(() => ({ capturedProcessor: null as ((job: any) => Promise<any>) | null }));

const mocks = vi.hoisted(() => ({
  mockFindAll: vi.fn(),
  mockFindById: vi.fn(),
  mockMarkAsPaid: vi.fn(),
  mockStrategyFindById: vi.fn(),
  mockCreatePayout: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockGetJobCounts: vi.fn(),
  mockQueueClose: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = mocks.mockQueueAdd;
    getJobCounts = mocks.mockGetJobCounts;
    close = mocks.mockQueueClose;
  },
  Worker: class {
    constructor(_name: string, processor: (job: any) => Promise<any>, _opts?: any) {
      state.capturedProcessor = processor;
    }
  },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../repositories/revenue-share-repository', () => ({
  revenueShareRepository: {
    findAll: (...args: any[]) => mocks.mockFindAll(...args),
    findById: (...args: any[]) => mocks.mockFindById(...args),
    markAsPaid: (...args: any[]) => mocks.mockMarkAsPaid(...args),
  },
}));

vi.mock('../../repositories', () => ({
  StrategyRepository: class {},
  strategyRepository: {
    findById: (...args: any[]) => mocks.mockStrategyFindById(...args),
  },
}));

vi.mock('../../../billing/nowpayments-service', () => ({
  NowPaymentsService: {
    getInstance: () => ({
      createPayout: (...args: any[]) => mocks.mockCreatePayout(...args),
    }),
  },
}));

import { MarketplacePayoutScheduler } from '../marketplace-payout-scheduler';

function fakeRevenueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rev_001',
    strategyId: 'strat_001',
    tenantId: 'tenant_001',
    subscriptionId: 'sub_001',
    grossRevenueCents: 2999,
    platformShareCents: 600,
    creatorShareCents: 2399,
    status: 'pending',
    ...overrides,
  };
}

function fakeStrategy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'strat_001',
    name: 'Test Strategy',
    creatorId: 'creator_001',
    payoutAddress: 'TXxxUSDTTRC20WalletAddress12345',
    ...overrides,
  };
}

describe('MarketplacePayoutScheduler', () => {
  let scheduler: MarketplacePayoutScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    state.capturedProcessor = null;
    mocks.mockQueueAdd.mockResolvedValue(undefined);
    mocks.mockGetJobCounts.mockResolvedValue({});
    mocks.mockQueueClose.mockResolvedValue(undefined);
    mocks.mockMarkAsPaid.mockResolvedValue(true);
    mocks.mockCreatePayout.mockResolvedValue({ payoutId: 'payout_001' });

    scheduler = new MarketplacePayoutScheduler();
  });

  describe('worker processor', () => {
    it('processes pending revenue shares and sends USDT payouts', async () => {
      mocks.mockFindAll.mockResolvedValue({
        data: [fakeRevenueRecord()],
        total: 1, page: 1, limit: 500, totalPages: 1,
      });
      mocks.mockFindById.mockResolvedValue(fakeRevenueRecord());
      mocks.mockStrategyFindById.mockResolvedValue(fakeStrategy());

      const result = await state.capturedProcessor!({ id: 'job_001', data: { manual: false } });

      expect(result.processed).toBe(1);
      expect(mocks.mockCreatePayout).toHaveBeenCalledWith({
        address: 'TXxxUSDTTRC20WalletAddress12345',
        amount: 23.99, // 2399 cents → $23.99
      });
      expect(mocks.mockMarkAsPaid).toHaveBeenCalledWith('rev_001', 'payout_001');
    });

    it('does NOT mark as paid when payout API fails', async () => {
      mocks.mockFindAll.mockResolvedValue({
        data: [fakeRevenueRecord()],
        total: 1, page: 1, limit: 500, totalPages: 1,
      });
      mocks.mockFindById.mockResolvedValue(fakeRevenueRecord());
      mocks.mockStrategyFindById.mockResolvedValue(fakeStrategy());
      mocks.mockCreatePayout.mockResolvedValue(null); // API failure

      const result = await state.capturedProcessor!({ id: 'job_002', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(mocks.mockCreatePayout).toHaveBeenCalled();
      expect(mocks.mockMarkAsPaid).not.toHaveBeenCalled();
    });

    it('skips already-paid records', async () => {
      mocks.mockFindAll.mockResolvedValue({
        data: [fakeRevenueRecord({ status: 'paid' })],
        total: 1, page: 1, limit: 500, totalPages: 1,
      });
      mocks.mockFindById.mockResolvedValue(fakeRevenueRecord({ status: 'paid' }));

      const result = await state.capturedProcessor!({ id: 'job_003', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(mocks.mockMarkAsPaid).not.toHaveBeenCalled();
    });

    it('skips when creator has no payoutAddress', async () => {
      mocks.mockFindAll.mockResolvedValue({
        data: [fakeRevenueRecord()],
        total: 1, page: 1, limit: 500, totalPages: 1,
      });
      mocks.mockFindById.mockResolvedValue(fakeRevenueRecord());
      mocks.mockStrategyFindById.mockResolvedValue(fakeStrategy({ payoutAddress: null }));

      const result = await state.capturedProcessor!({ id: 'job_004', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(result.skippedIds).toContain('rev_001');
      expect(mocks.mockCreatePayout).not.toHaveBeenCalled();
      expect(mocks.mockMarkAsPaid).not.toHaveBeenCalled();
    });

    it('handles missing revenue record gracefully', async () => {
      mocks.mockFindAll.mockResolvedValue({
        data: [fakeRevenueRecord()],
        total: 1, page: 1, limit: 500, totalPages: 1,
      });
      mocks.mockFindById.mockResolvedValue(null);

      const result = await state.capturedProcessor!({ id: 'job_005', data: { manual: false } });

      expect(result.errors).toHaveLength(1);
      expect(result.processed).toBe(0);
    });

    it('no-ops when no pending records exist', async () => {
      mocks.mockFindAll.mockResolvedValue({
        data: [], total: 0, page: 1, limit: 500, totalPages: 0,
      });

      const result = await state.capturedProcessor!({ id: 'job_006', data: { manual: false } });

      expect(result.processed).toBe(0);
      expect(result.ids).toEqual([]);
    });

    it('uses revenueIds from manual trigger job', async () => {
      mocks.mockFindById.mockResolvedValue(fakeRevenueRecord());
      mocks.mockStrategyFindById.mockResolvedValue(fakeStrategy());

      const result = await state.capturedProcessor!({
        id: 'job_007',
        data: { manual: true, revenueIds: ['rev_001', 'rev_002'] },
      });

      expect(result.processed).toBe(2);
      expect(mocks.mockFindAll).not.toHaveBeenCalled();
      expect(mocks.mockFindById).toHaveBeenCalledTimes(2);
    });
  });

  describe('scheduleWeeklyPayout', () => {
    it('adds a weekly repeat job', async () => {
      await scheduler.scheduleWeeklyPayout();
      expect(mocks.mockQueueAdd).toHaveBeenCalledWith(
        'weekly-payout',
        { manual: false },
        { repeat: { pattern: '0 2 * * 0' } },
      );
    });
  });

  describe('triggerManualPayout', () => {
    it('adds a manual payout job with revenue IDs', async () => {
      mocks.mockQueueAdd.mockResolvedValue({ id: 'job_manual' });

      const job = await scheduler.triggerManualPayout(['rev_001', 'rev_002']);

      expect(job.id).toBe('job_manual');
      expect(mocks.mockQueueAdd).toHaveBeenCalledWith('manual-payout', {
        revenueIds: ['rev_001', 'rev_002'],
        manual: true,
      });
    });
  });
});
