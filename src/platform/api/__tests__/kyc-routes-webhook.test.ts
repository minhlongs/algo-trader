/**
 * Tests for KYC Routes — webhook signature verification & status updates.
 *
 * Self-contained sub-suite. Re-declares mocks, buildApp, and helpers
 * so it can run independently of kyc-routes.test.ts.
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

describe('KYC Routes — webhook', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockVerifyHmac.mockReset();
    process.env.PERSONA_WEBHOOK_SECRET = 'test-secret';
  });

  it('returns 401 when signature is missing', async () => {
    const res = await request(buildApp()).post('/api/kyc/webhook').send(PAYLOAD);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing signature');
  });

  it('returns 401 when timestamp is missing', async () => {
    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set('x-signature-256', 'sha256=ok').send(PAYLOAD);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing timestamp');
  });

  it('returns 401 when timestamp is not a number', async () => {
    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set('x-signature-256', 'sha256=ok').set('x-timestamp', 'nope').send(PAYLOAD);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid timestamp');
  });

  it('returns 401 when signature is invalid', async () => {
    mockVerifyHmac.mockReturnValue(false);
    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send(PAYLOAD);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid signature');
  });

  it('returns 400 when required fields are missing', async () => {
    mockVerifyHmac.mockReturnValue(true);
    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send({ tenantId: 't1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is invalid', async () => {
    mockVerifyHmac.mockReturnValue(true);
    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send({ tenantId: 't1', status: 'garbage', id: 'v1' });
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockVerifyHmac.mockReturnValue(true);
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const res = await request(buildApp()).post('/api/kyc/webhook')
      .set(SIG()).send(PAYLOAD);
    expect(res.status).toBe(500);
  });
});
