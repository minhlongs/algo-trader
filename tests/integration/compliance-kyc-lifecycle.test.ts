/**
 * Compliance + KYC Lifecycle Integration Test
 * E2E HTTP flow: compliance trade validation, KYC init/status/webhook,
 * compliance rules management, and audit log via Express + supertest.
 * All DB and HMAC dependencies are mocked at module level.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockQuery = vi.fn();

vi.mock('../../src/shared/db/postgres-client', () => ({
  getDbClient: vi.fn(() => ({ query: mockQuery })),
}));
vi.mock('../../src/platform/middleware/feature-gate', () => ({
  requireTier: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../src/shared/utils/hmac-verifier', () => ({
  verifyHmacSha256: vi.fn(() => true),
}));

import { complianceRouter } from '../../src/platform/api/routes/compliance-routes';
import { kycRouter } from '../../src/platform/api/routes/kyc-routes';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(complianceRouter);
  app.use('/api/kyc', kycRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

const VALID_TRADE = {
  pair: 'BTC/USDT',
  side: 'buy' as const,
  amount: 5,
  price: 100,
  counterparty: 'exchange-a',
};

describe('Compliance + KYC Lifecycle (E2E)', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PERSONA_WEBHOOK_SECRET = 'test-hmac-secret';
    app = buildApp();
  });

  it('POST /api/compliance/validate — blocks $15K trade (AML $10K threshold)', async () => {
    const res = await request(app)
      .post('/api/compliance/validate')
      .send({ ...VALID_TRADE, amount: 15, price: 1000 }); // $15,000
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(false);
    const failed = res.body.results.filter(
      (r: { passed: boolean }) => r.passed === false,
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].ruleId).toMatch(/^AML/);
  });

  it('POST /api/compliance/validate — allows $500 trade', async () => {
    const res = await request(app)
      .post('/api/compliance/validate')
      .send(VALID_TRADE); // $500
    expect(res.status).toBe(200);
    expect(res.body.passed).toBe(true);
    const failed = res.body.results.filter(
      (r: { passed: boolean }) => r.passed === false,
    );
    expect(failed.length).toBe(0);
  });

  it('GET /api/compliance/rules — returns all built-in rules', async () => {
    const res = await request(app).get('/api/compliance/rules');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rules)).toBe(true);
    expect(res.body.rules.length).toBeGreaterThanOrEqual(6);
    for (const rule of res.body.rules) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('enabled');
    }
  });

  it('PUT /api/compliance/rules/:id/toggle — disables a rule', async () => {
    const list = await request(app).get('/api/compliance/rules');
    const targetId: string = list.body.rules[0].id;
    const res = await request(app).put(`/api/compliance/rules/${targetId}/toggle`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(targetId);
    expect(res.body.enabled).toBe(false);
  });

  it('GET /api/compliance/audit — returns audit entries', async () => {
    await request(app)
      .post('/api/compliance/validate')
      .send({ ...VALID_TRADE, amount: 15, price: 1000 });
    const res = await request(app).get('/api/compliance/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/kyc/init — creates submission (201)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'kyc-001',
          status: 'in_progress',
          verification_level: 'basic',
          created_at: new Date().toISOString(),
        }],
      });
    const res = await request(app).post('/api/kyc/init').send({
      tenantId: 'tenant-abc',
      providerAccountId: 'persona-acct-123',
      verificationLevel: 'basic',
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('kyc-001');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.tenantId).toBe('tenant-abc');
  });

  it('GET /api/kyc/status — returns submission', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'kyc-001',
        provider: 'persona',
        status: 'approved',
        verification_level: 'basic',
        provider_reference: 'ref-123',
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    });
    const res = await request(app).get('/api/kyc/status');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('kyc-001');
    expect(res.body.status).toBe('approved');
  });

  it('POST /api/kyc/webhook — updates status (HMAC verified via mock)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'kyc-001', provider_reference: 'ref-123', tenant_id: 'tenant-abc' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/kyc/webhook')
      .set('X-Signature-256', 'sha256=fakesig')
      .set('X-Timestamp', String(Math.floor(Date.now() / 1000)))
      .send({
        tenantId: 'tenant-abc',
        status: 'approved',
        id: 'kyc-001',
        providerReference: 'ref-123',
      });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(res.body.verificationId).toBe('kyc-001');
    expect(res.body.status).toBe('approved');
  });
});
