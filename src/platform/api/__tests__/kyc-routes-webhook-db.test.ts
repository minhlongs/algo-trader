/**
 * Tests for KYC Routes — webhook DB interactions (200, 404, verified_at).
 *
 * Self-contained sub-suite. Re-declares mocks, buildApp, and helpers
 * so it can run independently of kyc-routes-webhook.test.ts.
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

const SIG = () => ({
  'x-signature-256': 'sha256=ok',
  'x-timestamp': String(Math.floor(Date.now() / 1000)),
});

const PAYLOAD = { tenantId: 't1', status: 'approved', id: 'ver_123', providerReference: 'ref_abc' };

describe('KYC Routes — webhook DB', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockVerifyHmac.mockReset();
    process.env.PERSONA_WEBHOOK_SECRET = 'test-secret';
  });

  it('returns 200 and updates DB on valid signature', async () => {
    mockVerifyHmac.mockReturnValue(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send(PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.verificationId).toBe('ver_123');
    expect(mockVerifyHmac).toHaveBeenCalled();
  });

  it('returns 404 when verification is not found', async () => {
    mockVerifyHmac.mockReturnValue(true);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send(PAYLOAD);

    expect(res.status).toBe(404);
  });

  it('sets verified_at to NOW() when status is approved', async () => {
    mockVerifyHmac.mockReturnValue(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send({ tenantId: 't1', status: 'approved', id: 'v1' });

    expect(mockQuery.mock.calls[1][0]).toContain('NOW()');
  });

  it('sets verified_at to NULL when status is rejected', async () => {
    mockVerifyHmac.mockReturnValue(true);
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send({ tenantId: 't1', status: 'rejected', id: 'v1' });

    expect(mockQuery.mock.calls[1][0]).toContain('NULL');
  });
});
