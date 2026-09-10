/**
 * Tests for marketplace-disputeRoutes — marketplaceDisputeRouter.
 *
 * Covers: helper functions, Zod validation, POST / (file dispute),
 * GET / (list disputes), GET /:id (get dispute detail).
 *
 * Uses supertest + Express like admin-marketplace-dispute-routes.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const fileDisputeMock = vi.hoisted(() => vi.fn());
const getSubMock = vi.hoisted(() => vi.fn());
const listDisputesMock = vi.hoisted(() => vi.fn());
const getDisputeMock = vi.hoisted(() => vi.fn());
const auditLogMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../src/platform/marketplace/services/dispute.service', () => ({
  DisputeService: {
    getInstance: () => ({
      fileDispute: fileDisputeMock,
      getSubscriptionForDispute: getSubMock,
      listDisputes: listDisputesMock,
      getDispute: getDisputeMock,
    }),
  },
}));

vi.mock('../../../../../src/platform/audit/audit-log-service', () => ({
  AuditLogService: {
    getInstance: () => ({ log: auditLogMock }),
  },
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { marketplaceDisputeRouter, getQueryString, getQueryNumber, isAdmin } from '../../../../../src/platform/api/routes/marketplace-dispute-routes';

// ── Helpers ──────────────────────────────────────────────────────────────────

type UserRole = 'user' | 'admin';

function buildApp(userRole: UserRole) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', tenantId: 't-1', tier: 'PREMIUM', role: userRole };
    next();
  });
  app.use(marketplaceDisputeRouter);
  return app;
}

const DISPUTE = { id: 'd-1', tenantId: 't-1', status: 'open' };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('marketplaceDisputeRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== POST / ====================

  describe('POST /', () => {
    it('files a dispute and returns 201', async () => {
      getSubMock.mockResolvedValue({ tenantId: 't-1', id: 'sub-1' });
      fileDisputeMock.mockResolvedValue(DISPUTE);

      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'other',
          description: 'This is a valid dispute description with enough characters to pass validation.',
        });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(DISPUTE);
      expect(fileDisputeMock).toHaveBeenCalledOnce();
      expect(auditLogMock).toHaveBeenCalledOnce();
      expect(loggerInfoMock).toHaveBeenCalled();
    });

    it('includes evidenceUrls when provided', async () => {
      getSubMock.mockResolvedValue({ tenantId: 't-1', id: 'sub-1' });
      fileDisputeMock.mockResolvedValue(DISPUTE);

      await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'strategy_broken',
          description: 'The strategy stopped working after a recent API change broke compatibility.',
          evidenceUrls: ['https://example.com/evidence.png'],
        });

      expect(fileDisputeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceUrls: ['https://example.com/evidence.png'],
        }),
      );
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(buildApp('user'))
        .post('/')
        .send({ listingId: 'L1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
      expect(fileDisputeMock).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid reason enum', async () => {
      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'invalid_reason',
          description: 'This description is long enough to pass the validation check.',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });

    it('returns 400 for description too short', async () => {
      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'other',
          description: 'Short',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });

    it('returns 400 for evidenceUrls exceeding max length', async () => {
      const tooMany = Array.from({ length: 11 }, (_, i) => `https://example.com/img${i}.png`);
      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'other',
          description: 'This description is long enough to pass the validation check.',
          evidenceUrls: tooMany,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    });

    it('returns 404 when subscription not found', async () => {
      getSubMock.mockResolvedValue(null);

      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'missing',
          reason: 'other',
          description: 'This description is long enough to pass the validation check.',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
      expect(fileDisputeMock).not.toHaveBeenCalled();
    });

    it('returns 403 when subscription belongs to different tenant', async () => {
      getSubMock.mockResolvedValue({ tenantId: 'other-tenant' });

      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'other',
          description: 'This description is long enough to pass the validation check.',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
      expect(fileDisputeMock).not.toHaveBeenCalled();
    });

    it('returns 500 when service throws', async () => {
      getSubMock.mockResolvedValue({ tenantId: 't-1' });
      fileDisputeMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp('user'))
        .post('/')
        .send({
          listingId: 'L1',
          subscriptionId: 'sub-1',
          reason: 'other',
          description: 'This description is long enough to pass the validation check.',
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal server error');
      expect(loggerErrorMock).toHaveBeenCalled();
    });

    it('falls back to req.user.tenantId when req.tenant is missing', async () => {
      getSubMock.mockResolvedValue({ tenantId: 't-1' });
      fileDisputeMock.mockResolvedValue(DISPUTE);

      const res = await request(
        buildApp('user')
      ).post('/').send({
        listingId: 'L1',
        subscriptionId: 'sub-1',
        reason: 'poor_support',
        description: 'The creator has not responded to my support requests in over two weeks.',
      });

      expect(res.status).toBe(201);
      expect(fileDisputeMock).toHaveBeenCalled();
    });

    it('uses req.apiKey.userId when req.user is missing', async () => {
      getSubMock.mockResolvedValue({ tenantId: 't-1' });
      fileDisputeMock.mockResolvedValue(DISPUTE);

      const res = await request(
        buildApp('user')
      ).post('/').send({
        listingId: 'L1',
        subscriptionId: 'sub-1',
        reason: 'unauthorized_charges',
        description: 'I was charged without my authorization for this subscription product.',
      });

      expect(res.status).toBe(201);
      expect(fileDisputeMock).toHaveBeenCalled();
    });
  });

  // ==================== GET / ====================

  describe('GET /', () => {
    it('returns disputes list with default pagination', async () => {
      listDisputesMock.mockResolvedValue({ disputes: [], total: 0 });

      const res = await request(buildApp('user')).get('/');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ disputes: [], total: 0 });
      expect(listDisputesMock).toHaveBeenCalledWith('t-1', {
        status: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('passes status filter when valid', async () => {
      listDisputesMock.mockResolvedValue({ disputes: [DISPUTE], total: 1 });

      const res = await request(buildApp('user'))
        .get('/')
        .query({ status: 'open' });

      expect(res.status).toBe(200);
      expect(res.body.disputes).toHaveLength(1);
      expect(listDisputesMock).toHaveBeenCalledWith('t-1', {
        status: 'open',
        page: 1,
        limit: 20,
      });
    });

    it('returns 400 for invalid status enum', async () => {
      const res = await request(buildApp('user')).get('/').query({ status: 'bogus' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('returns 400 for page below minimum', async () => {
      const res = await request(buildApp('user')).get('/').query({ page: '0' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('returns 400 for limit above maximum', async () => {
      const res = await request(buildApp('user')).get('/').query({ limit: '200' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid query parameters');
    });

    it('returns 500 when service throws', async () => {
      listDisputesMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp('user')).get('/');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to list disputes');
      expect(loggerErrorMock).toHaveBeenCalled();
    });
  });

  // ==================== GET /:id ====================

  describe('GET /:id', () => {
    it('returns dispute when tenant matches', async () => {
      getDisputeMock.mockResolvedValue(DISPUTE);

      const res = await request(buildApp('user')).get('/d-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(DISPUTE);
    });

    it('returns 404 when dispute not found', async () => {
      getDisputeMock.mockResolvedValue(null);

      const res = await request(buildApp('user')).get('/missing');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('returns 404 when dispute belongs to different tenant and user is not admin', async () => {
      getDisputeMock.mockResolvedValue({ id: 'd-1', tenantId: 'other-tenant' });

      const res = await request(buildApp('user')).get('/d-1');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Dispute not found');
    });

    it('allows admin to view disputes from other tenants', async () => {
      const otherTenantDispute = { id: 'd-1', tenantId: 'other-tenant' };
      getDisputeMock.mockResolvedValue(otherTenantDispute);

      const res = await request(buildApp('admin')).get('/d-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(otherTenantDispute);
    });

    it('returns 500 when service throws', async () => {
      getDisputeMock.mockRejectedValue(new Error('db down'));

      const res = await request(buildApp('user')).get('/d-1');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Failed to get dispute');
      expect(loggerErrorMock).toHaveBeenCalled();
    });
  });
});

// ── Helper Functions ──────────────────────────────────────────────────────────

describe('getQueryString', () => {
  it('returns default when value is undefined', () => {
    expect(getQueryString(undefined)).toBe('');
  });

  it('returns default when value is null', () => {
    expect(getQueryString(null, 'fallback')).toBe('fallback');
  });

  it('returns first element when value is an array', () => {
    expect(getQueryString(['a', 'b'])).toBe('a');
  });

  it('stringifies non-string array element', () => {
    expect(getQueryString([42])).toBe('42');
  });

  it('returns string directly', () => {
    expect(getQueryString('hello')).toBe('hello');
  });

  it('stringifies non-string non-array value', () => {
    expect(getQueryString(123)).toBe('123');
  });
});

describe('getQueryNumber', () => {
  it('returns default when value is undefined', () => {
    expect(getQueryNumber(undefined)).toBe(0);
  });

  it('returns default when value is null', () => {
    expect(getQueryNumber(null, 5)).toBe(5);
  });

  it('parses first array element as string', () => {
    expect(getQueryNumber(['10'])).toBe(10);
  });

  it('returns first array element when it is a number', () => {
    expect(getQueryNumber([7])).toBe(7);
  });

  it('returns default for non-numeric array element', () => {
    expect(getQueryNumber(['abc'], 3)).toBe(3);
  });

  it('parses numeric string', () => {
    expect(getQueryNumber('42')).toBe(42);
  });

  it('returns default for non-numeric string', () => {
    expect(getQueryNumber('xyz', 2)).toBe(2);
  });

  it('returns number directly', () => {
    expect(getQueryNumber(99)).toBe(99);
  });

  it('stringifies other types to default', () => {
    expect(getQueryNumber({}, 8)).toBe(8);
  });
});

describe('isAdmin', () => {
  it('returns true when user role is admin', () => {
    expect(isAdmin({ user: { role: 'admin' } } as any)).toBe(true);
  });

  it('returns true when apiKey.isAdmin is true', () => {
    expect(isAdmin({ apiKey: { isAdmin: true } } as any)).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isAdmin({ user: { role: 'user' } } as any)).toBe(false);
  });

  it('returns false when nothing present', () => {
    expect(isAdmin({} as any)).toBe(false);
  });
});
