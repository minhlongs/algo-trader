/**
 * Referral Routes — Integration Tests
 *
 * Tests: POST /generate-code, GET /stats, POST /track-click, POST /validate, GET /my-code
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/feature-gate', () => ({
  requireTier: () => (_req: any, _res: any, next: any) => next(),
}));

const mocks = vi.hoisted(() => ({
  mockReferralCode: { code: 'REFCODE1', tenantId: 'tenant_001', isActive: true, usedCount: 0, maxUses: null } as any,
  mockStats: { totalClicks: 10, totalConversions: 2, commissionEarned: 150 },
  mockClick: { id: 'click_001', code: 'REFCODE1', ip: '127.0.0.1' },
  mockCommissions: { commissions: [{ id: 'comm_001', commissionAmount: 50, status: 'pending' }], total: 1 },
  mockService: {
    registerReferralCode: vi.fn().mockResolvedValue(undefined),
    getReferralStats: vi.fn().mockResolvedValue(undefined),
    getReferralCode: vi.fn().mockResolvedValue(undefined),
    getReferralCodeByCode: vi.fn().mockResolvedValue(undefined),
    trackReferralClick: vi.fn().mockResolvedValue(undefined),
    getCommissions: vi.fn().mockResolvedValue(undefined),
    getClicks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../referral/referral-service', () => ({
  referralService: mocks.mockService,
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { referralRouter } from '../referral-routes';

function buildApp(claims?: { sub?: string; role?: string }) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    if (claims) req.claims = claims;
    next();
  });
  app.use('/api/v1/referral', referralRouter);
  return app;
}

describe('Referral Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockService.registerReferralCode.mockResolvedValue(mocks.mockReferralCode);
    mocks.mockService.getReferralStats.mockResolvedValue(mocks.mockStats);
    mocks.mockService.getReferralCode.mockResolvedValue(mocks.mockReferralCode);
    mocks.mockService.getReferralCodeByCode.mockResolvedValue(mocks.mockReferralCode);
    mocks.mockService.trackReferralClick.mockResolvedValue(mocks.mockClick);
    mocks.mockService.getCommissions.mockResolvedValue(mocks.mockCommissions);
  });

  describe('POST /generate-code', () => {
    it('returns 201 with referral code', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app)
        .post('/api/v1/referral/generate-code')
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('REFCODE1');
    });

    it('returns 401 without claims', async () => {
      const app = buildApp();
      const res = await request(app)
        .post('/api/v1/referral/generate-code')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('GET /stats', () => {
    it('returns 200 with referral stats', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app).get('/api/v1/referral/stats');

      expect(res.status).toBe(200);
      expect(res.body.data.totalClicks).toBe(10);
    });

    it('returns 401 without claims', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/v1/referral/stats');

      expect(res.status).toBe(401);
    });

    it('returns 404 when stats not found', async () => {
      mocks.mockService.getReferralStats.mockResolvedValueOnce(null);
      const app = buildApp({ sub: 'tenant_002' });
      const res = await request(app).get('/api/v1/referral/stats');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /track-click', () => {
    it('returns 201 with tracking data', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app)
        .post('/api/v1/referral/track-click?code=REFCODE1')
        .send({ ip: '127.0.0.1', userAgent: 'test-agent' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('click_001');
    });

    it('returns 400 without code query param', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app)
        .post('/api/v1/referral/track-click')
        .send({ ip: '127.0.0.1' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /validate', () => {
    it('returns 200 with valid code info', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app)
        .post('/api/v1/referral/validate')
        .send({ referralCode: 'REFCODE1', tenantId: 'new_tenant' });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
    });

    it('returns 400 without required fields', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app)
        .post('/api/v1/referral/validate')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /my-code', () => {
    it('returns 200 with referral code', async () => {
      const app = buildApp({ sub: 'tenant_001' });
      const res = await request(app).get('/api/v1/referral/my-code');

      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('REFCODE1');
    });
  });
});
