/**
 * Marketplace Subscription Execution Handlers Tests
 * Covers: executeSubscription (invalid-body/404/403/500/success),
 * executeStrategyForSubscribers (invalid-body/500/success).
 * Mirrors pattern from referral-routes-admin.test.ts — mocks at service layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  mockGetSubscription: vi.fn(),
  mockExecuteForSubscriber: vi.fn(),
  mockExecuteActiveForStrategy: vi.fn(),
  mockGetTenantId: vi.fn(),
  mockGetUserId: vi.fn(),
  mockGetQueryString: vi.fn((v: unknown) => (typeof v === 'string' ? v : '')),
  mockIsAdmin: vi.fn().mockReturnValue(false),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/platform/marketplace/services/subscription.service', () => ({
  SubscriptionService: {
    getInstance: () => ({ getSubscription: mocks.mockGetSubscription }),
  },
}));

vi.mock('../../../../../src/platform/marketplace/services/marketplace-execution-bridge', () => ({
  MarketplaceExecutionBridge: {
    getInstance: () => ({
      executeForSubscriber: mocks.mockExecuteForSubscriber,
      executeActiveForStrategy: mocks.mockExecuteActiveForStrategy,
    }),
  },
}));

vi.mock('../../../../../src/platform/api/routes/marketplace-subscription-helpers', () => ({
  getTenantId: (...args: unknown[]) => mocks.mockGetTenantId(...args),
  getUserId: (...args: unknown[]) => mocks.mockGetUserId(...args),
  getQueryString: (...args: unknown[]) => mocks.mockGetQueryString(...args),
  isAdmin: (...args: unknown[]) => mocks.mockIsAdmin(...args),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: mocks.mockLogger,
}));

import {
  executeSubscription,
  executeStrategyForSubscribers,
} from '../../../../../src/platform/api/routes/marketplace-subscription-execution-handlers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('marketplace-subscription-execution-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetTenantId.mockReturnValue('tenant_001');
    mocks.mockGetUserId.mockReturnValue('user_001');
    mocks.mockGetQueryString.mockImplementation((v: unknown) =>
      typeof v === 'string' ? v : '',
    );
  });

  // ── executeSubscription ──────────────────────────────────────────────────────

  describe('executeSubscription', () => {
    it('returns 400 when body fails executeSingleSchema', async () => {
      const res = mockRes();
      // marketPayload must be a record — send a string to fail validation
      await executeSubscription(
        mockReq({ body: { marketPayload: 'not-a-record' } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' }),
      );
    });

    it('returns 404 when subscription not found', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-x');
      mocks.mockGetSubscription.mockResolvedValue(null);
      const res = mockRes();
      await executeSubscription(mockReq({ params: { id: 'sub-x' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Not found' }),
      );
    });

    it('returns 403 when cross-tenant and not admin', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-1');
      mocks.mockGetTenantId.mockReturnValue('tenant_001');
      mocks.mockGetSubscription.mockResolvedValue({ id: 'sub-1', tenantId: 'tenant_other' });
      mocks.mockIsAdmin.mockReturnValue(false);
      const res = mockRes();
      await executeSubscription(mockReq({ params: { id: 'sub-1' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Forbidden' }),
      );
    });

    it('allows admin to execute cross-tenant subscription', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-1');
      mocks.mockGetTenantId.mockReturnValue('admin_tenant');
      mocks.mockGetSubscription.mockResolvedValue({ id: 'sub-1', tenantId: 'other_tenant' });
      mocks.mockIsAdmin.mockReturnValue(true);
      mocks.mockExecuteForSubscriber.mockResolvedValue({ success: true });
      const res = mockRes();
      await executeSubscription(mockReq({ params: { id: 'sub-1' }, body: {} }), res);
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionId: 'sub-1' }),
      );
    });

    it('returns result on success', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-ok');
      mocks.mockGetSubscription.mockResolvedValue({ id: 'sub-ok', tenantId: 'tenant_001' });
      mocks.mockExecuteForSubscriber.mockResolvedValue({ pnlUsd: 250 });
      const res = mockRes();
      await executeSubscription(mockReq({ params: { id: 'sub-ok' }, body: {} }), res);
      expect(res.json).toHaveBeenCalledWith({
        subscriptionId: 'sub-ok',
        result: { pnlUsd: 250 },
      });
    });

    it('passes marketPayload to the bridge', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-p');
      mocks.mockGetSubscription.mockResolvedValue({ id: 'sub-p', tenantId: 'tenant_001' });
      mocks.mockExecuteForSubscriber.mockResolvedValue({});
      const res = mockRes();
      await executeSubscription(
        mockReq({ params: { id: 'sub-p' }, body: { marketPayload: { price: 0.5 } } }),
        res,
      );
      expect(mocks.mockExecuteForSubscriber).toHaveBeenCalledWith('sub-p', { price: 0.5 });
    });

    it('returns 500 on bridge error', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-err');
      mocks.mockGetSubscription.mockResolvedValue({ id: 'sub-err', tenantId: 'tenant_001' });
      mocks.mockExecuteForSubscriber.mockRejectedValue(new Error('bridge down'));
      const res = mockRes();
      await executeSubscription(mockReq({ params: { id: 'sub-err' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal server error' }),
      );
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });

    it('handles non-Error thrown value in catch', async () => {
      mocks.mockGetQueryString.mockReturnValue('sub-ne');
      mocks.mockGetSubscription.mockResolvedValue({ id: 'sub-ne', tenantId: 'tenant_001' });
      mocks.mockExecuteForSubscriber.mockRejectedValue('string error');
      const res = mockRes();
      await executeSubscription(mockReq({ params: { id: 'sub-ne' }, body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── executeStrategyForSubscribers ────────────────────────────────────────────

  describe('executeStrategyForSubscribers', () => {
    it('returns 400 when body fails executeSchema (missing strategyId)', async () => {
      const res = mockRes();
      await executeStrategyForSubscribers(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid request body' }),
      );
    });

    it('returns 400 when strategyId is empty string', async () => {
      const res = mockRes();
      await executeStrategyForSubscribers(
        mockReq({ body: { strategyId: '' } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns results on success', async () => {
      mocks.mockExecuteActiveForStrategy.mockResolvedValue([
        { subId: 's1', success: true },
        { subId: 's2', success: false },
      ]);
      const res = mockRes();
      await executeStrategyForSubscribers(
        mockReq({ body: { strategyId: 'strat-1' } }),
        res,
      );
      expect(res.json).toHaveBeenCalledWith({
        strategyId: 'strat-1',
        executions: 2,
        results: [
          { subId: 's1', success: true },
          { subId: 's2', success: false },
        ],
      });
      expect(mocks.mockExecuteActiveForStrategy).toHaveBeenCalledWith('strat-1', {});
    });

    it('passes custom marketPayload', async () => {
      mocks.mockExecuteActiveForStrategy.mockResolvedValue([]);
      const res = mockRes();
      await executeStrategyForSubscribers(
        mockReq({ body: { strategyId: 's2', marketPayload: { key: 'val' } } }),
        res,
      );
      expect(mocks.mockExecuteActiveForStrategy).toHaveBeenCalledWith('s2', { key: 'val' });
    });

    it('returns 500 on bridge error', async () => {
      mocks.mockExecuteActiveForStrategy.mockRejectedValue(new Error('service down'));
      const res = mockRes();
      await executeStrategyForSubscribers(
        mockReq({ body: { strategyId: 'strat-err' } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal server error' }),
      );
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });

    it('handles non-Error thrown value in catch', async () => {
      mocks.mockExecuteActiveForStrategy.mockRejectedValue(42);
      const res = mockRes();
      await executeStrategyForSubscribers(
        mockReq({ body: { strategyId: 'strat-ne' } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
