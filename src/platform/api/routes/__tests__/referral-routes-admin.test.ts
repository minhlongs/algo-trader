/**
 * Referral Routes — Admin Handlers Tests
 * Covers: isTenantAdmin, handleGetStats (unauth/success/404/error),
 * handleGetCode (unauth/success/404/error),
 * handleGenerateCode (unauth/self-generate/admin-generate/non-admin-forbidden/error).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  mockReferralService: {
    getReferralStats: vi.fn(),
    getReferralCode: vi.fn(),
    registerReferralCode: vi.fn(),
  },
  mockResolveTenant: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../platform/referral/referral-service', () => ({
  referralService: mocks.mockReferralService,
}));

vi.mock('../../../../shared/tenant', () => ({
  resolveTenant: mocks.mockResolveTenant,
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: mocks.mockLogger,
}));

import {
  isTenantAdmin,
  handleGetStats,
  handleGetCode,
  handleGenerateCode,
} from '../referral-routes-admin';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(overrides: Record<string, unknown> = {}) {
  return { body: {}, ...overrides } as unknown as Request;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('referral-routes-admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── isTenantAdmin ───────────────────────────────────────────────────────────

  describe('isTenantAdmin', () => {
    it('returns true for admin role', () => {
      expect(isTenantAdmin({ role: 'admin' })).toBe(true);
    });

    it('returns false for non-admin role', () => {
      expect(isTenantAdmin({ role: 'user' })).toBe(false);
    });

    it('returns false when role is undefined', () => {
      expect(isTenantAdmin({})).toBe(false);
    });
  });

  // ── handleGetStats ──────────────────────────────────────────────────────────

  describe('handleGetStats', () => {
    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const res = mockRes();
      await handleGetStats(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns stats on success', async () => {
      const stats = { totalClicks: 10, conversions: 2, earned: 50 };
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralStats.mockResolvedValue(stats);
      const res = mockRes();
      await handleGetStats(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith({ data: stats });
    });

    it('returns 404 when stats is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralStats.mockResolvedValue(null);
      const res = mockRes();
      await handleGetStats(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'No referral data found' });
    });

    it('returns 500 on service error', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralStats.mockRejectedValue(new Error('db down'));
      const res = mockRes();
      await handleGetStats(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch referral stats' });
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });

    it('handles non-Error thrown value', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralStats.mockRejectedValue('string error');
      const res = mockRes();
      await handleGetStats(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── handleGetCode ───────────────────────────────────────────────────────────

  describe('handleGetCode', () => {
    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const res = mockRes();
      await handleGetCode(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns code on success', async () => {
      const code = { code: 'REF-123', tenantId: 't1', isActive: true };
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralCode.mockResolvedValue(code);
      const res = mockRes();
      await handleGetCode(mockReq(), res);
      expect(res.json).toHaveBeenCalledWith({ data: code });
    });

    it('returns 404 when code is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralCode.mockResolvedValue(null);
      const res = mockRes();
      await handleGetCode(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No referral code found',
        message: 'Generate a referral code first',
      });
    });

    it('returns 500 on service error', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralCode.mockRejectedValue(new Error('timeout'));
      const res = mockRes();
      await handleGetCode(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch referral code' });
    });

    it('handles non-Error thrown value', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.getReferralCode.mockRejectedValue(42);
      const res = mockRes();
      await handleGetCode(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── handleGenerateCode ──────────────────────────────────────────────────────

  describe('handleGenerateCode', () => {
    it('returns 401 when tenantId is null', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: null, source: 'none' });
      const res = mockRes();
      await handleGenerateCode(mockReq(), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('generates code for self when no body.tenantId', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session', role: 'user' });
      mocks.mockReferralService.registerReferralCode.mockResolvedValue({ code: 'NEW-CODE' });
      const res = mockRes();
      await handleGenerateCode(mockReq({ body: {} }), res);
      expect(mocks.mockReferralService.registerReferralCode).toHaveBeenCalledWith('t1');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ code: 'NEW-CODE' });
    });

    it('allows admin to generate for another tenant', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 'admin-t', source: 'user-session', role: 'admin' });
      mocks.mockReferralService.registerReferralCode.mockResolvedValue({ code: 'FOR-OTHER' });
      const res = mockRes();
      await handleGenerateCode(mockReq({ body: { tenantId: 'target-t' } }), res);
      expect(mocks.mockReferralService.registerReferralCode).toHaveBeenCalledWith('target-t');
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('returns 403 when non-admin tries to generate for another tenant', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 'user-t', source: 'user-session', role: 'user' });
      const res = mockRes();
      await handleGenerateCode(mockReq({ body: { tenantId: 'other-t' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden: Can only generate for yourself' });
      expect(mocks.mockReferralService.registerReferralCode).not.toHaveBeenCalled();
    });

    it('returns 400 on service error with Error message', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.registerReferralCode.mockRejectedValue(new Error('duplicate code'));
      const res = mockRes();
      await handleGenerateCode(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'duplicate code' });
    });

    it('returns 400 with generic message for non-Error throw', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 't1', source: 'user-session' });
      mocks.mockReferralService.registerReferralCode.mockRejectedValue('unknown');
      const res = mockRes();
      await handleGenerateCode(mockReq({ body: {} }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate referral code' });
    });

    it('admin generating for self uses own tenantId (not body)', async () => {
      mocks.mockResolveTenant.mockReturnValue({ tenantId: 'admin-t', source: 'user-session', role: 'admin' });
      mocks.mockReferralService.registerReferralCode.mockResolvedValue({ code: 'SELF' });
      const res = mockRes();
      // body.tenantId === tenantId → not "another tenant", so no 403
      await handleGenerateCode(mockReq({ body: { tenantId: 'admin-t' } }), res);
      expect(mocks.mockReferralService.registerReferralCode).toHaveBeenCalledWith('admin-t');
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
