/**
 * Credentials Routes — Integration Tests
 *
 * Tests: POST / (create/upsert credentials)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  mockSave: vi.fn().mockResolvedValue(undefined),
  mockAppendAuditLog: vi.fn().mockResolvedValue(undefined),
  mockAssertAccess: vi.fn(),
}));

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../db/tenant-credentials-repository', () => ({
  TenantCredentialsRepository: class {
    save = mocks.mockSave;
  },
}));

vi.mock('../../../raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: (...args: any[]) => mocks.mockAssertAccess(...args),
}));

vi.mock('../../../audit/tenant-audit-log', () => ({
  appendTenantAuditLog: (...args: any[]) => mocks.mockAppendAuditLog(...args),
}));

import { credentialsRouter } from '../credentials-routes';

function buildApp(claims?: { sub?: string; role?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    if (claims) req.claims = claims;
    next();
  });
  app.use('/api/v1/credentials', credentialsRouter);
  return app;
}

describe('Credentials Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAccess.mockImplementation(() => {});
  });

  it('returns 201 when credentials are ingested successfully', async () => {
    const app = buildApp({ sub: 'tenant_001' });
    const res = await request(app)
      .post('/api/v1/credentials')
      .send({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        passphrase: 'test-passphrase',
        privateKey: 'test-private-key',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(mocks.mockSave).toHaveBeenCalledOnce();
    expect(mocks.mockAppendAuditLog).toHaveBeenCalledOnce();
  });

  it('returns 400 when required body fields are missing', async () => {
    const app = buildApp({ sub: 'tenant_001' });
    const res = await request(app)
      .post('/api/v1/credentials')
      .send({ apiKey: 'test-key' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 403 without subscriber claims', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/credentials')
      .send({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        passphrase: 'test-passphrase',
        privateKey: 'test-private-key',
      });

    expect(res.status).toBe(403);
  });

  it('returns 403 on cross-tenant access error', async () => {
    mocks.mockAssertAccess.mockImplementationOnce(() => {
      throw new Error('cross-tenant access denied');
    });

    const app = buildApp({ sub: 'tenant_001' });
    const res = await request(app)
      .post('/api/v1/credentials')
      .send({
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        passphrase: 'test-passphrase',
        privateKey: 'test-private-key',
      });

    expect(res.status).toBe(403);
  });

  it('returns 400 when fields are empty strings', async () => {
    const app = buildApp({ sub: 'tenant_001' });
    const res = await request(app)
      .post('/api/v1/credentials')
      .send({
        apiKey: '',
        apiSecret: '',
        passphrase: '',
        privateKey: '',
      });

    expect(res.status).toBe(400);
  });
});
