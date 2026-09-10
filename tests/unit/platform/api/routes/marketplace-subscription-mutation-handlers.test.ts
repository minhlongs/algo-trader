/**
 * Tests for marketplace-subscription-mutation-handlers
 * Covers: updateSubscription (pause/resume/cancel, validation, 404, 403, error),
 *         getSubscriptionPerformance (success, 404, 403, error)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSubscription, mockUpdateSubscriptionStatus, mockGetSubscriptionPerformance } = vi.hoisted(() => ({
  mockGetSubscription: vi.fn(),
  mockUpdateSubscriptionStatus: vi.fn(),
  mockGetSubscriptionPerformance: vi.fn(),
}));

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/platform/marketplace/services/subscription.service', () => ({
  SubscriptionService: {
    getInstance: () => ({
      getSubscription: mockGetSubscription,
      updateSubscriptionStatus: mockUpdateSubscriptionStatus,
      getSubscriptionPerformance: mockGetSubscriptionPerformance,
    }),
  },
}));

vi.mock('../../../../../src/platform/audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({
      log: mockAuditLog,
    }),
  },
}));

// Must mock helpers to control tenantId/userId/isAdmin
vi.mock('../../../../../src/platform/api/routes/marketplace-subscription-helpers', () => ({
  getTenantId: (req: { tenantId?: string }) => {
    if (!req.tenantId) throw new Error('Unauthorized: No tenant context');
    return req.tenantId;
  },
  getUserId: (req: { userId?: string }) => {
    if (!req.userId) throw new Error('Unauthorized: No user context');
    return req.userId;
  },
  getQueryString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : ''),
  isAdmin: (req: { admin?: boolean }) => req.admin === true,
}));

import { updateSubscription, getSubscriptionPerformance } from '../../../../../src/platform/api/routes/marketplace-subscription-mutation-handlers';

function mockRes() {
  const res: Record<string, unknown> = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: unknown) => { res.body = data; return res; };
  return res as never;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    params: { id: 'sub_1' },
    body: {},
    tenantId: 'tenant_1',
    userId: 'user_1',
    ...overrides,
  } as never;
}

describe('marketplace-subscription-mutation-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── updateSubscription ──

  describe('updateSubscription', () => {
    it('resumes subscription (status: active → resume action)', async () => {
      const sub = { id: 'sub_1', tenantId: 'tenant_1', status: 'paused' };
      mockGetSubscription.mockResolvedValue(sub);
      mockUpdateSubscriptionStatus.mockResolvedValue({ ...sub, status: 'active' });

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'active' } }), res);

      expect(res.statusCode).toBe(200);
      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith('sub_1', 'resume', 'user_1');
      expect(mockAuditLog).toHaveBeenCalled();
    });

    it('pauses subscription (status: paused → pause action)', async () => {
      const sub = { id: 'sub_1', tenantId: 'tenant_1', status: 'active' };
      mockGetSubscription.mockResolvedValue(sub);
      mockUpdateSubscriptionStatus.mockResolvedValue({ ...sub, status: 'paused' });

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'paused' } }), res);

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith('sub_1', 'pause', 'user_1');
    });

    it('cancels subscription (status: cancelled → cancel action)', async () => {
      const sub = { id: 'sub_1', tenantId: 'tenant_1', status: 'active' };
      mockGetSubscription.mockResolvedValue(sub);
      mockUpdateSubscriptionStatus.mockResolvedValue({ ...sub, status: 'cancelled' });

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'cancelled' } }), res);

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith('sub_1', 'cancel', 'user_1');
    });

    it('returns 400 on invalid body', async () => {
      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'invalid' } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });

    it('returns 400 when body is empty', async () => {
      const res = mockRes();
      await updateSubscription(mockReq({ body: {} }), res);

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when subscription not found', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'active' } }), res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('returns 403 for wrong tenant (non-admin)', async () => {
      mockGetSubscription.mockResolvedValue({ id: 'sub_1', tenantId: 'other_tenant', status: 'active' });

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'paused' } }), res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('allows admin to update another tenant subscription', async () => {
      mockGetSubscription.mockResolvedValue({ id: 'sub_1', tenantId: 'other_tenant', status: 'active' });
      mockUpdateSubscriptionStatus.mockResolvedValue({ status: 'paused' });

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'paused' }, admin: true }), res);

      expect(res.statusCode).toBe(200);
    });

    it('returns 500 on service error', async () => {
      mockGetSubscription.mockRejectedValue(new Error('DB failure'));

      const res = mockRes();
      await updateSubscription(mockReq({ body: { status: 'active' } }), res);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  // ── getSubscriptionPerformance ──

  describe('getSubscriptionPerformance', () => {
    it('returns performance metrics for valid subscription', async () => {
      const sub = { id: 'sub_1', tenantId: 'tenant_1' };
      const perf = { pnl: 500, winRate: 0.65 };
      mockGetSubscription.mockResolvedValue(sub);
      mockGetSubscriptionPerformance.mockResolvedValue(perf);

      const res = mockRes();
      await getSubscriptionPerformance(mockReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(perf);
    });

    it('returns 404 when subscription not found', async () => {
      mockGetSubscription.mockResolvedValue(null);

      const res = mockRes();
      await getSubscriptionPerformance(mockReq(), res);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Not found');
    });

    it('returns 403 for wrong tenant (non-admin)', async () => {
      mockGetSubscription.mockResolvedValue({ id: 'sub_1', tenantId: 'other_tenant' });

      const res = mockRes();
      await getSubscriptionPerformance(mockReq(), res);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('allows admin to view another tenant performance', async () => {
      mockGetSubscription.mockResolvedValue({ id: 'sub_1', tenantId: 'other_tenant' });
      mockGetSubscriptionPerformance.mockResolvedValue({ pnl: 100 });

      const res = mockRes();
      await getSubscriptionPerformance(mockReq({ admin: true }), res);

      expect(res.statusCode).toBe(200);
    });

    it('returns 500 on service error', async () => {
      mockGetSubscription.mockRejectedValue(new Error('DB failure'));

      const res = mockRes();
      await getSubscriptionPerformance(mockReq(), res);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});
