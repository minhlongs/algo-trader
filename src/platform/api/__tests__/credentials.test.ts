process.env.CREDENTIALS_ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.LICENSE_ENCRYPTION_KEY = '12345678901234567890123456789012';
process.env.LICENSE_ACTIVATION_SECRET = 'secret';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Define hoisted mocks so they are available to hoisted vi.mock calls
const { mockSave, mockGet, mockDelete, mockAppendAudit } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
  mockAppendAudit: vi.fn().mockResolvedValue(undefined),
}));

// Mock postgres client to prevent real DB queries
vi.mock('../../../shared/db/postgres-client', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  getDbClient: () => ({}),
}));

// Mock TenantCredentialsRepository methods using hoisted variables
vi.mock('../../../db/tenant-credentials-repository', () => ({
  TenantCredentialsRepository: class {
    save = mockSave;
    get = mockGet;
    delete = mockDelete;
  },
}));

// Mock tenant-audit-log to avoid real DB writes during unit tests
vi.mock('../../../audit/tenant-audit-log', () => ({
  appendTenantAuditLog: mockAppendAudit,
}));

import { credentialsRouter } from '../routes/credentials-routes';

function buildApp(claims?: { sub?: string; role?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: Request & { claims?: unknown }, _res: Response, next: NextFunction) => {
    if (claims) {
      req.claims = claims;
    }
    next();
  });
  app.use('/api/v1/subscriber/credentials', credentialsRouter);
  return app;
}

describe('Credentials Ingestion API', () => {
  const VALID_BODY = {
    apiKey: 'my-api-key',
    apiSecret: 'my-api-secret',
    passphrase: 'my-passphrase',
    privateKey: 'my-private-key',
  };

  beforeEach(() => {
    mockSave.mockReset();
    mockGet.mockReset();
    mockDelete.mockReset();
  });

  it('should accept valid credentials and return 201 when authenticated', async () => {
    mockSave.mockResolvedValue(undefined);
    const app = buildApp({ sub: 'tenant-123', role: 'subscriber' });

    const res = await request(app)
      .post('/api/v1/subscriber/credentials')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.message).toBe('Credentials ingested successfully');
    expect(mockSave).toHaveBeenCalledWith('tenant-123', VALID_BODY);
  });

  it('should return 400 when request body is missing fields', async () => {
    const app = buildApp({ sub: 'tenant-123', role: 'subscriber' });

    const res = await request(app)
      .post('/api/v1/subscriber/credentials')
      .send({ apiKey: 'key-only' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is required');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('should return 403 when no subscriber identity (sub claim) is present in JWT', async () => {
    const app = buildApp(); // no claims

    const res = await request(app)
      .post('/api/v1/subscriber/credentials')
      .send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('no subscriber identity');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('should throw an error and block execution inside SubscriberExecutor if credentials do not exist', async () => {
    const { SubscriberExecutor } = await import('../../raas/subscriber-executor');
    const executor = new SubscriberExecutor();

    // Mock repository get returning null
    mockGet.mockResolvedValue(null);

    await expect(
      executor.execute({
        subscriberId: 'tenant-without-creds',
        strategyId: 'strat-1',
        marketPayload: {},
        capitalUsdt: 100,
      })
    ).rejects.toThrow('Credentials not found for subscriber: tenant-without-creds');
  });

  it('should execute successfully inside SubscriberExecutor if credentials exist', async () => {
    const { SubscriberExecutor } = await import('../../raas/subscriber-executor');
    const executor = new SubscriberExecutor();

    // Mock repository get returning credentials
    mockGet.mockResolvedValue({
      apiKey: 'api-key-val',
      apiSecret: 'api-secret-val',
      passphrase: 'passphrase-val',
      privateKey: 'private-key-val',
    });

    const result = await executor.execute({
      subscriberId: 'tenant-with-creds',
      strategyId: 'strat-1',
      marketPayload: {},
      capitalUsdt: 100,
    });

    expect(result.subscriberId).toBe('tenant-with-creds');
    expect(result.status).toBeDefined();
  });
});
