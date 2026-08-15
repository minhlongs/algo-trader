/**
 * Tests for KYC Routes — Phase 35 BYOK Persona verification endpoints
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { mockQuery, mockVerifyHmac } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockVerifyHmac: vi.fn(),
}));

vi.mock('../../../shared/db/postgres-client', () => ({
  getDbClient: () => ({ query: mockQuery }),
}));
vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../middleware/feature-gate', () => ({
  requireTier: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../../shared/utils/hmac-verifier', () => ({
  verifyHmacSha256: (...args: unknown[]) => mockVerifyHmac(...args),
}));

import { kycRouter } from '../routes/kyc-routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/kyc', kycRouter);
  return app;
}

const ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'kyc_001',
  provider: 'persona',
  status: 'approved',
  verification_level: 'advanced',
  provider_reference: 'ref_abc',
  result: null,
  expires_at: '2027-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  ...overrides,
});

const INSERT_ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'kyc_001',
  status: 'in_progress',
  verification_level: 'basic',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('KYC Routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockVerifyHmac.mockReset();
    process.env.PERSONA_WEBHOOK_SECRET = 'test-secret';
  });

  describe('POST /api/kyc/init', () => {
    it('returns 400 when tenantId is missing', async () => {
      const res = await request(buildApp()).post('/api/kyc/init').send({ providerAccountId: 'a' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    it('returns 400 when providerAccountId is missing', async () => {
      const res = await request(buildApp()).post('/api/kyc/init').send({ tenantId: 't1' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid verificationLevel', async () => {
      const res = await request(buildApp())
        .post('/api/kyc/init')
        .send({ tenantId: 't1', providerAccountId: 'acct1', verificationLevel: 'super' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when providerAccountId is too short', async () => {
      const res = await request(buildApp())
        .post('/api/kyc/init')
        .send({ tenantId: 't1', providerAccountId: 'ab' });
      expect(res.status).toBe(400);
    });

    it('returns 409 when pending verification exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
      const res = await request(buildApp())
        .post('/api/kyc/init')
        .send({ tenantId: 't1', providerAccountId: 'acct_1' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Conflict');
    });

    it('creates verification and returns 201', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [INSERT_ROW()] });
      const res = await request(buildApp())
        .post('/api/kyc/init')
        .send({ tenantId: 'tenant_1', providerAccountId: 'acct_1', verificationLevel: 'basic' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('kyc_001');
      expect(res.body.status).toBe('in_progress');
      expect(res.body.tenantId).toBe('tenant_1');
    });

    it('defaults verificationLevel to basic when omitted', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [INSERT_ROW()] });
      await request(buildApp())
        .post('/api/kyc/init')
        .send({ tenantId: 't2', providerAccountId: 'acct_2' });
      // INSERT params: [tenantId, providerAccountId, level]
      expect(mockQuery.mock.calls[1][1][2]).toBe('basic');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      const res = await request(buildApp())
        .post('/api/kyc/init')
        .send({ tenantId: 't1', providerAccountId: 'acct_1' });
      expect(res.status).toBe(500);
    });

    it('returns 400 when both tenantId and providerAccountId are missing', async () => {
      const res = await request(buildApp()).post('/api/kyc/init').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/kyc/status', () => {
    it('returns latest verification for tenant via header', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ROW()] });
      const res = await request(buildApp())
        .get('/api/kyc/status')
        .set('x-tenant-id', 'tenant_1');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('kyc_001');
      expect(res.body.status).toBe('approved');
      expect(res.body.verificationLevel).toBe('advanced');
    });

    it('returns status none when no verification exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(buildApp()).get('/api/kyc/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('none');
    });

    it('defaults tenant to default when header missing', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await request(buildApp()).get('/api/kyc/status');
      expect(mockQuery.mock.calls[0][1][0]).toBe('default');
    });

    it('returns expired status when expires_at is in the past', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [ROW({ status: 'approved', expires_at: '2020-01-01T00:00:00Z' })],
      });
      const res = await request(buildApp())
        .get('/api/kyc/status')
        .set('x-tenant-id', 't1');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('expired');
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('lost'));
      const res = await request(buildApp()).get('/api/kyc/status');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/kyc/status/:tenantId', () => {
    it('returns verification list for specified tenant', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [ROW({ id: 'k1' }), ROW({ id: 'k2', status: 'rejected' })],
      });
      const res = await request(buildApp()).get('/api/kyc/status/tenant_abc');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[1].status).toBe('rejected');
    });

    it('returns empty array when no verifications found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(buildApp()).get('/api/kyc/status/tenant_none');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('supports limit query parameter for pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [ROW()] });
      const res = await request(buildApp())
        .get('/api/kyc/status/tenant_1?limit=5');
      expect(res.status).toBe(200);
      expect(mockQuery.mock.calls[0][1]).toEqual(['tenant_1', 5]);
    });

    it('returns 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('timeout'));
      const res = await request(buildApp()).get('/api/kyc/status/tenant_err');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/kyc/webhook', () => {
    const WEBHOOK_PAYLOAD = {
      tenantId: 't1',
      status: 'approved',
      id: 'ver_123',
      providerReference: 'ref_abc',
    };

    it('returns 200 and updates DB on valid signature', async () => {
      mockVerifyHmac.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=abc123')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.verificationId).toBe('ver_123');
      expect(mockVerifyHmac).toHaveBeenCalled();
    });

    it('returns 401 when signature is missing', async () => {
      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing signature');
    });

    it('returns 401 when timestamp is missing', async () => {
      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing timestamp');
    });

    it('returns 401 when timestamp is not a number', async () => {
      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', 'not-a-number')
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid timestamp');
    });

    it('returns 401 when signature is invalid', async () => {
      mockVerifyHmac.mockReturnValue(false);

      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=wrong')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid signature');
    });

    it('returns 400 when required fields are missing', async () => {
      mockVerifyHmac.mockReturnValue(true);

      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send({ tenantId: 't1' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when status is invalid', async () => {
      mockVerifyHmac.mockReturnValue(true);

      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send({ tenantId: 't1', status: 'garbage', id: 'v1' });

      expect(res.status).toBe(400);
    });

    it('returns 404 when verification is not found', async () => {
      mockVerifyHmac.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(404);
    });

    it('sets verified_at to NOW() when status is approved', async () => {
      mockVerifyHmac.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send({ tenantId: 't1', status: 'approved', id: 'v1' });

      expect(mockQuery.mock.calls[1][0]).toContain('NOW()');
    });

    it('sets verified_at to NULL when status is rejected', async () => {
      mockVerifyHmac.mockReturnValue(true);
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send({ tenantId: 't1', status: 'rejected', id: 'v1' });

      expect(mockQuery.mock.calls[1][0]).toContain('NULL');
    });

    it('returns 500 on database error', async () => {
      mockVerifyHmac.mockReturnValue(true);
      mockQuery.mockRejectedValueOnce(new Error('db down'));

      const res = await request(buildApp())
        .post('/api/kyc/webhook')
        .set('x-signature-256', 'sha256=ok')
        .set('x-timestamp', String(Math.floor(Date.now() / 1000)))
        .send(WEBHOOK_PAYLOAD);

      expect(res.status).toBe(500);
    });
  });
});
