/**
 * Credentials Routes — Integration Tests
 *
 * Tests: POST /  (create/upsert credentials)
 *        GET  /  (report which fields are configured)
 *        DELETE / (remove credentials, audited)
 * Plus: auth failures, validation, error catch blocks, field mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  mockSave: vi.fn().mockResolvedValue(undefined),
  mockGet: vi.fn().mockResolvedValue(null),
  mockExists: vi.fn().mockResolvedValue(true),
  mockDelete: vi.fn().mockResolvedValue(undefined),
  mockEmitUpsert: vi.fn().mockResolvedValue(undefined),
  mockEmitDelete: vi.fn().mockResolvedValue(undefined),
  mockAssertAccess: vi.fn(),
}));

vi.mock('../../../../../src/platform/middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../../../../../src/platform/db/tenant-credentials-repository', () => ({
  TenantCredentialsRepository: class {
    save = mocks.mockSave;
    get = mocks.mockGet;
    exists = mocks.mockExists;
    delete = mocks.mockDelete;
  },
}));

vi.mock('../../../../../src/platform/raas/subscriber-tenant-isolator', () => ({
  assertTenantAccess: (...args: any[]) => mocks.mockAssertAccess(...args),
}));

vi.mock('../../../../../src/platform/audit/audit-hooks', () => ({
  emitCredentialUpsertAuditEvent: (...args: any[]) => mocks.mockEmitUpsert(...args),
  emitCredentialDeletionAuditEvent: (...args: any[]) => mocks.mockEmitDelete(...args),
}));

import { credentialsRouter } from '../../../../../src/platform/api/routes/credentials-routes';

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
    mocks.mockSave.mockResolvedValue(undefined);
    mocks.mockGet.mockResolvedValue(null);
    mocks.mockExists.mockResolvedValue(true);
    mocks.mockDelete.mockResolvedValue(undefined);
    mocks.mockEmitUpsert.mockResolvedValue(undefined);
    mocks.mockEmitDelete.mockResolvedValue(undefined);
  });

  // ── POST / — happy path + validation ─────────────────────────────────────

  describe('POST /', () => {
    it('returns 201 when credentials are ingested successfully', async () => {
      const app = buildApp({ sub: 'tenant-001' });
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
      expect(mocks.mockEmitUpsert).toHaveBeenCalledOnce();
    });

    it('persists passphrase=null and publicKey=null when optional fields omitted', async () => {
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'k', apiSecret: 's' });

      expect(res.status).toBe(201);
      expect(mocks.mockSave).toHaveBeenCalledWith('tenant-001', {
        apiKey: 'k',
        apiSecret: 's',
        passphrase: null,
        privateKey: null,
        publicKey: null,
      });
    });

    it('returns 400 when required body fields are missing', async () => {
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'test-key' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when fields are empty strings', async () => {
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: '', apiSecret: '', passphrase: '', privateKey: '' });

      expect(res.status).toBe(400);
    });

    it('returns 500 when repository.save throws', async () => {
      mocks.mockSave.mockRejectedValue(new Error('db down'));
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'k', apiSecret: 's' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db down');
    });

    it('returns 500 with Unknown error when save throws a non-Error', async () => {
      mocks.mockSave.mockRejectedValue('boom');
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'k', apiSecret: 's' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Unknown error');
    });
  });

  // ── Auth / tenant isolation ───────────────────────────────────────────────

  describe('auth failures', () => {
    it('returns 403 without subscriber claims', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'test-api-key', apiSecret: 'test-api-secret' });

      expect(res.status).toBe(403);
    });

    it('returns 403 on cross-tenant access error', async () => {
      mocks.mockAssertAccess.mockImplementationOnce(() => {
        throw new Error('cross-tenant access denied');
      });
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'test-api-key', apiSecret: 'test-api-secret' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when tenantId fails validation (invalid chars)', async () => {
      const app = buildApp({ sub: 'not a valid tenant!' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'k', apiSecret: 's' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when tenantId is empty string', async () => {
      const app = buildApp({ sub: '' });
      const res = await request(app)
        .post('/api/v1/credentials')
        .send({ apiKey: 'k', apiSecret: 's' });

      expect(res.status).toBe(403);
    });
  });

  // ── GET / — field presence report ─────────────────────────────────────────

  describe('GET /', () => {
    it('returns configured:false with empty fields when no credentials exist', async () => {
      mocks.mockGet.mockResolvedValue(null);
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).get('/api/v1/credentials');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ configured: false, fields: {} });
    });

    it('returns configured:true with field presence map when credentials exist', async () => {
      mocks.mockGet.mockResolvedValue({
        apiKey: 'k',
        apiSecret: 's',
        passphrase: null,
        privateKey: 'pk',
        publicKey: null,
      });
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).get('/api/v1/credentials');

      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.fields).toEqual({
        apiKey: true,
        apiSecret: true,
        passphrase: false,
        privateKey: true,
        publicKey: false,
      });
    });

    it('returns 403 without subscriber claims', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/credentials');
      expect(res.status).toBe(403);
    });

    it('returns 500 when repository.get throws', async () => {
      mocks.mockGet.mockRejectedValue(new Error('db down'));
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).get('/api/v1/credentials');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db down');
    });

    it('returns 500 with Unknown error when get throws a non-Error', async () => {
      mocks.mockGet.mockRejectedValue(42);
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).get('/api/v1/credentials');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Unknown error');
    });
  });

  // ── DELETE / — remove credentials ─────────────────────────────────────────

  describe('DELETE /', () => {
    it('returns 200 and emits audit event when credentials existed', async () => {
      mocks.mockExists.mockResolvedValue(true);
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).delete('/api/v1/credentials');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(mocks.mockDelete).toHaveBeenCalledOnce();
      expect(mocks.mockEmitDelete).toHaveBeenCalledOnce();
    });

    it('returns 200 but skips audit event when no credentials existed', async () => {
      mocks.mockExists.mockResolvedValue(false);
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).delete('/api/v1/credentials');

      expect(res.status).toBe(200);
      expect(mocks.mockDelete).toHaveBeenCalledOnce();
      expect(mocks.mockEmitDelete).not.toHaveBeenCalled();
    });

    it('returns 403 without subscriber claims', async () => {
      const app = buildApp();
      const res = await request(app).delete('/api/v1/credentials');
      expect(res.status).toBe(403);
    });

    it('returns 500 when repository.exists throws', async () => {
      mocks.mockExists.mockRejectedValue(new Error('db down'));
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).delete('/api/v1/credentials');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('db down');
    });

    it('returns 500 with Unknown error when delete throws a non-Error', async () => {
      mocks.mockExists.mockResolvedValue(true);
      mocks.mockDelete.mockRejectedValue(null);
      const app = buildApp({ sub: 'tenant-001' });
      const res = await request(app).delete('/api/v1/credentials');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Unknown error');
    });
  });
});
