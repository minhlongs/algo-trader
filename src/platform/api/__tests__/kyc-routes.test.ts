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

describe('KYC Routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockVerifyHmac.mockReset();
    process.env.PERSONA_WEBHOOK_SECRET = 'test-secret';
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
});
