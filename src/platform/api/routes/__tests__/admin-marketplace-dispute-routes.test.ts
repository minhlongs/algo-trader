/**
 * Admin Marketplace Dispute Routes — Integration Tests
 *
 * Covers the three routes registered by registerMarketplaceDisputeRoutes:
 * GET /disputes, PATCH /disputes/:id/resolve, PATCH /disputes/:id/escalate —
 * success paths, non-admin 403s, zod 400s, 404 not-found, and the defensive
 * 500 paths.
 *
 * DisputeService, AuditLogService, requireTier, and logger are mocked via
 * vi.hoisted. isAdmin()/getUserId()/getQueryString() run for real against a
 * stubbed req.user set by a tiny middleware in buildApp().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';

const listMock = vi.hoisted(() => vi.fn());
const getDisputeMock = vi.hoisted(() => vi.fn());
const resolveMock = vi.hoisted(() => vi.fn());
const escalateMock = vi.hoisted(() => vi.fn());
const auditLogMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../marketplace/services/dispute.service', () => ({
  DisputeService: {
    getInstance: () => ({
      listAllDisputes: listMock,
      getDispute: getDisputeMock,
      resolveDispute: resolveMock,
      escalateDispute: escalateMock,
    }),
  },
}));

vi.mock('../../../audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({ log: auditLogMock }),
  },
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { registerMarketplaceDisputeRoutes } from '../admin-marketplace-dispute-routes';

type UserRole = 'admin' | 'creator';

function buildApp(userRole: UserRole) {
  const app = express();
  app.use(express.json());
  // Stub auth context: isAdmin() checks req.user.role === 'admin';
  // getUserId() reads req.user.id.
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).user = { role: userRole, id: 'admin-1', tier: 'ENTERPRISE' };
    next();
  });
  const router = Router();
  registerMarketplaceDisputeRoutes(router);
  app.use(router);
  return app;
}

const DISPUTE = { id: 'd-1', tenantId: 't-1', status: 'open' };

describe('registerMarketplaceDisputeRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /disputes', () => {
    it('returns the dispute list for an admin', async () => {
      listMock.mockResolvedValue({ disputes: [DISPUTE], total: 1 });

      const res = await request(buildApp('admin')).get('/disputes').query({ status: 'open' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ disputes: [DISPUTE], total: 1 });
      expect(listMock).toHaveBeenCalledOnce();
      expect(listMock).toHaveBeenCalledWith({ status: 'open', page: 1, limit: 50 });
    });

    it('rejects a non-admin with 403', async () => {
      const res = await request(buildApp('creator')).get('/disputes');

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden', message: 'Admin access required' });
      expect(listMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid query param', async () => {
      const res = await request(buildApp('admin')).get('/disputes').query({ status: 'bogus' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
      expect(listMock).not.toHaveBeenCalled();
    });

    it('returns 500 when the service throws', async () => {
      listMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp('admin')).get('/disputes');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error', message: 'Failed to list disputes' });
      expect(loggerErrorMock).toHaveBeenCalledWith('[MarketplaceAdmin] Error listing disputes', expect.anything());
    });
  });

  describe('PATCH /disputes/:id/resolve', () => {
    it('resolves a dispute, writes an audit log, and logs info', async () => {
      getDisputeMock.mockResolvedValue(DISPUTE);
      resolveMock.mockResolvedValue({ ...DISPUTE, status: 'resolved_subscriber' });

      const res = await request(buildApp('admin'))
        .patch('/disputes/d-1/resolve')
        .send({ resolution: 'Refunded the subscriber in full', compensationType: 'full_refund' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...DISPUTE, status: 'resolved_subscriber' });
      expect(resolveMock).toHaveBeenCalledOnce();
      expect(resolveMock).toHaveBeenCalledWith('d-1', {
        resolution: 'Refunded the subscriber in full',
        compensationType: 'full_refund',
        compensationAmountCents: undefined,
        resolvedBy: 'admin-1',
        adminNotes: undefined,
      });
      expect(auditLogMock).toHaveBeenCalledOnce();
      expect(auditLogMock.mock.calls[0]![1]).toBe('api_call');
      expect(auditLogMock.mock.calls[0]![2].metadata).toMatchObject({
        action: 'dispute_resolved',
        adminUserId: 'admin-1',
        resourceId: 'd-1',
      });
      expect(loggerInfoMock).toHaveBeenCalledWith('[MarketplaceAdmin] Dispute resolved', expect.anything());
    });

    it('rejects a non-admin with 403', async () => {
      const res = await request(buildApp('creator'))
        .patch('/disputes/d-1/resolve')
        .send({ resolution: 'a long enough resolution' });

      expect(res.status).toBe(403);
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body (resolution too short)', async () => {
      const res = await request(buildApp('admin')).patch('/disputes/d-1/resolve').send({ resolution: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it('returns 404 when the dispute does not exist', async () => {
      getDisputeMock.mockResolvedValue(null);

      const res = await request(buildApp('admin'))
        .patch('/disputes/missing/resolve')
        .send({ resolution: 'a long enough resolution' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('missing');
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it('returns 500 when the service throws', async () => {
      getDisputeMock.mockResolvedValue(DISPUTE);
      resolveMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp('admin'))
        .patch('/disputes/d-1/resolve')
        .send({ resolution: 'a long enough resolution' });

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to resolve dispute');
      expect(loggerErrorMock).toHaveBeenCalledWith(
        '[MarketplaceAdmin] Error resolving dispute',
        expect.anything(),
      );
    });
  });

  describe('PATCH /disputes/:id/escalate', () => {
    it('escalates a dispute, writes an audit log, and logs info', async () => {
      getDisputeMock.mockResolvedValue(DISPUTE);
      escalateMock.mockResolvedValue({ ...DISPUTE, status: 'escalated' });

      const res = await request(buildApp('admin')).patch('/disputes/d-1/escalate');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...DISPUTE, status: 'escalated' });
      expect(escalateMock).toHaveBeenCalledWith('d-1', 'admin-1');
      expect(auditLogMock).toHaveBeenCalledOnce();
      expect(auditLogMock.mock.calls[0]![2].metadata).toMatchObject({ action: 'dispute_escalated' });
      expect(loggerInfoMock).toHaveBeenCalledWith('[MarketplaceAdmin] Dispute escalated', expect.anything());
    });

    it('rejects a non-admin with 403', async () => {
      const res = await request(buildApp('creator')).patch('/disputes/d-1/escalate');

      expect(res.status).toBe(403);
      expect(escalateMock).not.toHaveBeenCalled();
    });

    it('returns 404 when the dispute does not exist', async () => {
      getDisputeMock.mockResolvedValue(null);

      const res = await request(buildApp('admin')).patch('/disputes/missing/escalate');

      expect(res.status).toBe(404);
      expect(escalateMock).not.toHaveBeenCalled();
    });

    it('returns 500 when the service throws', async () => {
      getDisputeMock.mockResolvedValue(DISPUTE);
      escalateMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp('admin')).patch('/disputes/d-1/escalate');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to escalate dispute');
      expect(loggerErrorMock).toHaveBeenCalledWith(
        '[MarketplaceAdmin] Error escalating dispute',
        expect.anything(),
      );
    });
  });
});
