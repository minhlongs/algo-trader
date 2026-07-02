/**
 * Marketplace Execution Bridge — Unit Tests
 *
 * Tests executeForSubscriber + executeActiveForStrategy with mocked RaaS executor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockFindById: vi.fn(),
  mockFindActiveByStrategy: vi.fn(),
  mockSubUpdate: vi.fn(),
  mockPerfUpsert: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../raas/subscriber-executor', () => ({
  SubscriberExecutor: class {
    execute = mocks.mockExecute;
  },
}));

vi.mock('../../repositories/subscription-repository', () => ({
  SubscriptionRepository: vi.fn(),
  subscriptionRepository: {
    findById: (...args: any[]) => mocks.mockFindById(...args),
    findActiveByStrategy: (...args: any[]) => mocks.mockFindActiveByStrategy(...args),
    update: (...args: any[]) => mocks.mockSubUpdate(...args),
  },
}));

vi.mock('../../repositories/performance-repository', () => ({
  PerformanceRepository: vi.fn(),
  performanceRepository: {
    upsert: (...args: any[]) => mocks.mockPerfUpsert(...args),
  },
}));

import { MarketplaceExecutionBridge } from '../marketplace-execution-bridge';

function fakeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_001',
    tenantId: 'tenant_001',
    strategyId: 'strat_001',
    listingId: 'listing_001',
    status: 'active',
    allocationPercent: 25,
    currentInvestmentUsd: 10000,
    totalPnlUsd: 500,
    paymentId: 'pay_123',
    paymentStatus: 'paid',
    ...overrides,
  };
}

function fakeExecResult(overrides: Record<string, unknown> = {}) {
  return {
    signal: 'BUY',
    profit: 15.5,
    status: 'FILLED',
    confidence: 0.85,
    ...overrides,
  };
}

describe('MarketplaceExecutionBridge', () => {
  let bridge: MarketplaceExecutionBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = MarketplaceExecutionBridge.getInstance();
    mocks.mockSubUpdate.mockResolvedValue(undefined);
    mocks.mockPerfUpsert.mockResolvedValue(undefined);
  });

  describe('executeForSubscriber', () => {
    it('returns null for unknown subscription', async () => {
      mocks.mockFindById.mockResolvedValue(null);

      const result = await bridge.executeForSubscriber('bad_sub', {});

      expect(result).toBeNull();
      expect(mocks.mockExecute).not.toHaveBeenCalled();
    });

    it('skips inactive subscriptions', async () => {
      mocks.mockFindById.mockResolvedValue(fakeSub({ status: 'paused' }));

      const result = await bridge.executeForSubscriber('sub_001', {});

      expect(result).toBeNull();
      expect(mocks.mockExecute).not.toHaveBeenCalled();
    });

    it('executes and syncs P&L for active subscription', async () => {
      mocks.mockFindById.mockResolvedValue(fakeSub());
      mocks.mockExecute.mockResolvedValue(fakeExecResult());

      const result = await bridge.executeForSubscriber('sub_001', { price: 0.65 });

      expect(result).not.toBeNull();
      expect(result!.subscriptionId).toBe('sub_001');
      expect(result!.strategyId).toBe('strat_001');
      expect(result!.execResult.signal).toBe('BUY');
      expect(mocks.mockExecute).toHaveBeenCalledOnce();
      expect(mocks.mockSubUpdate).toHaveBeenCalledOnce();
      expect(mocks.mockPerfUpsert).toHaveBeenCalledOnce();
    });

    it('defaults capital to $100 when investment is zero', async () => {
      mocks.mockFindById.mockResolvedValue(fakeSub({ currentInvestmentUsd: 0 }));
      mocks.mockExecute.mockResolvedValue(fakeExecResult());

      await bridge.executeForSubscriber('sub_001', {});

      const execReq = mocks.mockExecute.mock.calls[0][0];
      expect(execReq.capitalUsdt).toBe(100);
    });

    it('syncs P&L correctly with negative profit', async () => {
      mocks.mockFindById.mockResolvedValue(fakeSub({ totalPnlUsd: 500, currentInvestmentUsd: 10000 }));
      mocks.mockExecute.mockResolvedValue(fakeExecResult({ profit: -3.0, status: 'FILLED' }));

      await bridge.executeForSubscriber('sub_001', {});

      const [subId, update] = mocks.mockSubUpdate.mock.calls[0];
      expect(subId).toBe('sub_001');
      expect(update.currentInvestmentUsd).toBe(9700);
      expect(update.totalPnlUsd).toBe(200);
    });
  });

  describe('executeActiveForStrategy', () => {
    it('returns empty array when no active subscribers', async () => {
      mocks.mockFindActiveByStrategy.mockResolvedValue([]);

      const results = await bridge.executeActiveForStrategy('strat_001', {});

      expect(results).toEqual([]);
    });

    it('executes for each active subscriber', async () => {
      mocks.mockFindActiveByStrategy.mockResolvedValue([
        fakeSub({ id: 'sub_001' }),
        fakeSub({ id: 'sub_002' }),
      ]);
      mocks.mockFindById.mockResolvedValue(fakeSub());
      mocks.mockExecute.mockResolvedValue(fakeExecResult());

      const results = await bridge.executeActiveForStrategy('strat_001', { price: 0.72 });

      expect(results).toHaveLength(2);
      expect(mocks.mockExecute).toHaveBeenCalledTimes(2);
    });

    it('continues on individual subscriber failure', async () => {
      mocks.mockFindActiveByStrategy.mockResolvedValue([
        fakeSub({ id: 'sub_001' }),
        fakeSub({ id: 'sub_002' }),
      ]);
      mocks.mockFindById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fakeSub({ id: 'sub_002' }));
      mocks.mockExecute.mockResolvedValue(fakeExecResult());

      const results = await bridge.executeActiveForStrategy('strat_001', {});

      expect(results).toHaveLength(1);
      expect(results[0].subscriptionId).toBe('sub_002');
    });
  });
});
