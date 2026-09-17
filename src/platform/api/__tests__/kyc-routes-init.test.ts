/**
 * Tests for KYC Routes — POST /api/kyc/init.
 *
 * Self-contained sub-suite. Re-declares mocks, buildApp, INSERT_ROW,
 * and beforeEach so it can run independently of kyc-routes.test.ts.
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

const INSERT_ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'kyc_001',
  status: 'in_progress',
  verification_level: 'basic',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('KYC Routes — init', () => {
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
});
