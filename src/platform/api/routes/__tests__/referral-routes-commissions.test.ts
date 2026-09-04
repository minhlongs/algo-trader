/**
 * Tests for referral-routes-commissions — GET /commissions, /payouts, /my-code, /clicks/:code.
 * Target: 100% coverage for src/platform/api/routes/referral-routes-commissions.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// --- Hoisted mocks (vi.mock hoists to top, so all references must be hoisted) ---
const mocks = vi.hoisted(() => ({
  mockResolveTenant: vi.fn(),
  mockSafeParse: vi.fn(),
  mockService: {
    getCommissions: vi.fn(),
    getReferralCode: vi.fn(),
    registerReferralCode: vi.fn(),
    getReferralCodeByCode: vi.fn(),
    getClicks: vi.fn(),
  },
}));

vi.mock('../../../../shared/tenant', () => ({
  resolveTenant: mocks.mockResolveTenant,
  validateTenantId: vi.fn(() => true),
}));

// --- Mock logger ---
vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// --- Mock referralService ---
vi.mock('../../../../platform/referral/referral-service', () => ({
  referralService: mocks.mockService,
}));

// --- Mock paginationSchema so we can trigger validation success/failure ---
vi.mock('../../schemas/referral.schemas', () => ({
  paginationSchema: { safeParse: mocks.mockSafeParse },
}));

// Import after mocks so they take effect
import {
  handleGetCommissions,
  handleGetPayouts,
  handleGetMyCode,
  handleGetClicks,
} from '../referral-routes-commissions';

function buildApp(handler: (req: express.Request, res: express.Response) => unknown) {
  const app = express();
  app.use(express.json());
  app.get('/test', handler);
  return app;
}

describe('referral-routes-commissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: valid tenant
    mocks.mockResolveTenant.mockReturnValue({ tenantId: 'tenant_001', source: 'user-session' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // handleGetCommissions
  // ═══════════════════════════════════════════════════════════
  describe('handleGetCommissions', () => {
    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const app = buildApp(handleGetCommissions);

      const res = await request(app).get('/test');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when query params fail validation', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'Invalid input: expected number, received NaN' }] },
      });
      const app = buildApp(handleGetCommissions);

      const res = await request(app).get('/test?page=invalid');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid input: expected number, received NaN' });
    });

    it('returns 400 with default message when issues array is empty', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: false,
        error: { issues: [] },
      });
      const app = buildApp(handleGetCommissions);

      const res = await request(app).get('/test');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid query parameters' });
    });

    it('returns 200 with commissions and pagination on success', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { status: 'paid', page: 2, limit: 10 },
      });
      mocks.mockService.getCommissions.mockResolvedValue({
        commissions: [
          { id: 'comm_001', commissionAmount: 50, status: 'paid' },
          { id: 'comm_002', commissionAmount: 100, status: 'paid' },
        ],
        total: 25,
      });
      const app = buildApp(handleGetCommissions);

      const res = await request(app).get('/test?page=2&limit=10&status=paid');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3, // ceil(25 / 10)
      });
      expect(mocks.mockService.getCommissions).toHaveBeenCalledWith(
        'tenant_001',
        'paid',
        10,
        10, // (page 2 - 1) * limit 10 = 10
      );
    });

    it('uses default page=1 and limit=50 when not provided', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { status: undefined, page: 1, limit: 50 },
      });
      mocks.mockService.getCommissions.mockResolvedValue({
        commissions: [],
        total: 0,
      });
      const app = buildApp(handleGetCommissions);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(mocks.mockService.getCommissions).toHaveBeenCalledWith(
        'tenant_001',
        undefined,
        50,
        0, // (page 1 - 1) * limit 50 = 0
      );
    });

    it('returns 500 when referralService throws', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { status: 'pending', page: 1, limit: 50 },
      });
      mocks.mockService.getCommissions.mockRejectedValue(new Error('DB connection refused'));
      const app = buildApp(handleGetCommissions);

      const res = await request(app).get('/test');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch commissions' });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // handleGetPayouts
  // ═══════════════════════════════════════════════════════════
  describe('handleGetPayouts', () => {
    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const app = buildApp(handleGetPayouts);

      const res = await request(app).get('/test');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when pagination validation fails', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'limit must be <= 100' }] },
      });
      const app = buildApp(handleGetPayouts);

      const res = await request(app).get('/test?limit=200');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'limit must be <= 100' });
    });

    it('returns 400 with default message when issues array empty', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: false,
        error: { issues: [] },
      });
      const app = buildApp(handleGetPayouts);

      const res = await request(app).get('/test');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid query parameters' });
    });

    it('returns 200 with paid commissions mapped to payouts', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getCommissions.mockResolvedValue({
        commissions: [
          {
            id: 'comm_001',
            commissionAmount: 50,
            currency: 'USD',
            stripePayoutId: 'po_123',
            status: 'paid',
            periodStart: '2026-08-01',
            periodEnd: '2026-08-31',
            paidAt: '2026-09-01',
          },
          {
            id: 'comm_002',
            commissionAmount: 100,
            status: 'pending', // should be filtered out
          },
        ],
        total: 2,
      });
      const app = buildApp(handleGetPayouts);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toEqual({
        id: 'comm_001',
        amount: 50,
        currency: 'USD',
        stripePayoutId: 'po_123',
        status: 'completed',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        paidAt: '2026-09-01',
        commissionCount: 1,
      });
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.pagination.totalPages).toBe(1);
    });

    it('returns 200 with empty payouts array', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getCommissions.mockResolvedValue({
        commissions: [],
        total: 0,
      });
      const app = buildApp(handleGetPayouts);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
      });
    });

    it('returns 500 when referralService throws', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getCommissions.mockRejectedValue(new Error('Service unavailable'));
      const app = buildApp(handleGetPayouts);

      const res = await request(app).get('/test');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch payouts' });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // handleGetMyCode
  // ═══════════════════════════════════════════════════════════
  describe('handleGetMyCode', () => {
    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const app = buildApp(handleGetMyCode);

      const res = await request(app).get('/test');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('returns existing code when found', async () => {
      const existingCode = { code: 'TEN-ABC12', tenantId: 'tenant_001', usedCount: 5 };
      mocks.mockService.getReferralCode.mockResolvedValue(existingCode);
      const app = buildApp(handleGetMyCode);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: existingCode });
      expect(mocks.mockService.registerReferralCode).not.toHaveBeenCalled();
    });

    it('auto-generates a code when none exists', async () => {
      mocks.mockService.getReferralCode.mockResolvedValue(null);
      const generatedCode = { code: 'GEN-XYZ99', tenantId: 'tenant_001', usedCount: 0 };
      mocks.mockService.registerReferralCode.mockResolvedValue(generatedCode);
      const app = buildApp(handleGetMyCode);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: generatedCode });
      expect(mocks.mockService.getReferralCode).toHaveBeenCalledWith('tenant_001');
      expect(mocks.mockService.registerReferralCode).toHaveBeenCalledWith('tenant_001');
    });

    it('returns 500 when referralService throws', async () => {
      mocks.mockService.getReferralCode.mockRejectedValue(new Error('DB error'));
      const app = buildApp(handleGetMyCode);

      const res = await request(app).get('/test');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to get referral code' });
    });

    it('returns 500 when registerReferralCode throws', async () => {
      mocks.mockService.getReferralCode.mockResolvedValue(null);
      mocks.mockService.registerReferralCode.mockRejectedValue(new Error('DB error'));
      const app = buildApp(handleGetMyCode);

      const res = await request(app).get('/test');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to get referral code' });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // handleGetClicks
  // ═══════════════════════════════════════════════════════════
  describe('handleGetClicks', () => {
    beforeEach(() => {
      // For handleGetClicks, the mock app needs req.params.code
      // We'll override buildApp usage by mounting the handler directly on a GET route with param
    });

    function buildClicksApp() {
      const app = express();
      app.use(express.json());
      app.get('/clicks/:code', handleGetClicks);
      return app;
    }

    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/REFCODE1');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 400 when pagination validation fails', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: 'page must be positive' }] },
      });
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/REFCODE1?page=-1');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'page must be positive' });
    });

    it('returns 403 when code does not exist', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getReferralCodeByCode.mockResolvedValue(null);
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/NOCODE1');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden: You do not own this referral code' });
    });

    it('returns 403 when code belongs to a different tenant', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getReferralCodeByCode.mockResolvedValue({
        code: 'REFCODE1',
        tenantId: 'tenant_999',
      });
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/REFCODE1');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden: You do not own this referral code' });
    });

    it('returns 200 with clicks when ownership verified', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getReferralCodeByCode.mockResolvedValue({
        code: 'REFCODE1',
        tenantId: 'tenant_001',
      });
      const mockClicks = [
        { id: 'click_001', code: 'REFCODE1', ip: '127.0.0.1' },
        { id: 'click_002', code: 'REFCODE1', ip: '10.0.0.1' },
      ];
      mocks.mockService.getClicks.mockResolvedValue(mockClicks);
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/REFCODE1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 50,
      });
      expect(mocks.mockService.getClicks).toHaveBeenCalledWith('REFCODE1', 50, 0);
    });

    it('returns 500 when referralService throws', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getReferralCodeByCode.mockRejectedValue(new Error('DB failure'));
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/REFCODE1');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch clicks' });
    });

    it('returns 500 when getClicks throws', async () => {
      mocks.mockSafeParse.mockReturnValue({
        success: true,
        data: { page: 1, limit: 50 },
      });
      mocks.mockService.getReferralCodeByCode.mockResolvedValue({
        code: 'REFCODE1',
        tenantId: 'tenant_001',
      });
      mocks.mockService.getClicks.mockRejectedValue(new Error('Fetch failed'));
      const app = buildClicksApp();

      const res = await request(app).get('/clicks/REFCODE1');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to fetch clicks' });
    });
  });
});
