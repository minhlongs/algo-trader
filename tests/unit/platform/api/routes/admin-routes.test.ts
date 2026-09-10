/**
 * Tests for Admin Routes (admin.ts)
 * Covers: /halt, /resume, /status, /circuit-breakers,
 *         /circuit-breakers/:name/reset, /circuit-breakers/reset-all
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request, Response } from 'express';

// ── Hoisted mocks ──

const { mockHalt, mockReset, mockGetStatus } = vi.hoisted(() => ({
  mockHalt: vi.fn(),
  mockReset: vi.fn(),
  mockGetStatus: vi.fn(),
}));

const { mockResume, mockGetMetrics } = vi.hoisted(() => ({
  mockResume: vi.fn(),
  mockGetMetrics: vi.fn(),
}));

const { mockLogAudit } = vi.hoisted(() => ({
  mockLogAudit: vi.fn(),
}));

const { mockHashIpAddress } = vi.hoisted(() => ({
  mockHashIpAddress: vi.fn().mockReturnValue('hashed-ip'),
}));

vi.mock('../../../../../src/platform/shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../../src/desk/risk/circuit-breaker', () => ({
  CircuitBreaker: class MockCircuitBreaker {
    halt = mockHalt;
    reset = mockReset;
    getStatus = mockGetStatus;
  },
}));

vi.mock('../../../../../src/desk/risk/drawdown-monitor', () => ({
  DrawdownMonitor: class MockDrawdownMonitor {
    resume = mockResume;
    getMetrics = mockGetMetrics;
  },
}));

vi.mock('../../../../../src/seed/security/audit-log', () => ({
  logAudit: mockLogAudit,
  hashIpAddress: mockHashIpAddress,
}));

// Mock requireAdminKey — works both as function call and Express middleware
vi.mock('../../../../../src/platform/api/middleware/require-admin-key', () => ({
  requireAdminKey: (req: Request, res: Response, next?: () => void): boolean => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey) {
      res.status(503).json({ error: 'Admin API not configured' });
      return false;
    }
    const provided = req.headers['x-admin-key'] as string | undefined;
    if (!provided || provided !== adminKey) {
      res.status(403).json({ error: 'Forbidden — invalid X-Admin-Key' });
      return false;
    }
    if (typeof next === 'function') next();
    return true;
  },
}));

// ── Source import (after mocks) ──

import { adminRouter } from '../../../../../src/platform/api/routes/admin';

// ── Helpers ──

const ADMIN_KEY = 'test-admin-key-12345';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  return app;
}

// ── Tests ──

describe('Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    mockGetStatus.mockResolvedValue({ state: 'CLOSED' });
    mockGetMetrics.mockResolvedValue({ isHalted: false });
    mockHalt.mockResolvedValue(undefined);
    mockReset.mockResolvedValue(undefined);
    mockResume.mockResolvedValue(undefined);
    mockLogAudit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  // ── POST /admin/halt ──

  describe('POST /admin/halt', () => {
    it('halts trading with valid reason', async () => {
      const res = await request(buildApp())
        .post('/admin/halt')
        .set('x-admin-key', ADMIN_KEY)
        .send({ reason: 'Market anomaly detected' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Market anomaly detected');
      expect(mockHalt).toHaveBeenCalledWith('Market anomaly detected');
      expect(mockLogAudit).toHaveBeenCalled();
    });

    it('returns 400 when reason is missing', async () => {
      const res = await request(buildApp())
        .post('/admin/halt')
        .set('x-admin-key', ADMIN_KEY)
        .send({});

      expect(res.status).toBe(400);
      expect(mockHalt).not.toHaveBeenCalled();
    });

    it('returns 400 when reason is empty string', async () => {
      const res = await request(buildApp())
        .post('/admin/halt')
        .set('x-admin-key', ADMIN_KEY)
        .send({ reason: '' });

      expect(res.status).toBe(400);
      expect(mockHalt).not.toHaveBeenCalled();
    });

    it('returns 400 when reason exceeds 500 characters', async () => {
      const res = await request(buildApp())
        .post('/admin/halt')
        .set('x-admin-key', ADMIN_KEY)
        .send({ reason: 'x'.repeat(501) });

      expect(res.status).toBe(400);
      expect(mockHalt).not.toHaveBeenCalled();
    });

    it('returns 500 when halt throws', async () => {
      mockHalt.mockRejectedValue(new Error('Halt failed'));

      const res = await request(buildApp())
        .post('/admin/halt')
        .set('x-admin-key', ADMIN_KEY)
        .send({ reason: 'Emergency stop' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Halt failed');
    });

    it('returns 500 with default message for non-Error throw', async () => {
      mockHalt.mockRejectedValue('string error');

      const res = await request(buildApp())
        .post('/admin/halt')
        .set('x-admin-key', ADMIN_KEY)
        .send({ reason: 'Emergency stop' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to halt trading');
    });

    it('returns 403 without admin key', async () => {
      const res = await request(buildApp())
        .post('/admin/halt')
        .send({ reason: 'test' });

      expect(res.status).toBe(403);
      expect(mockHalt).not.toHaveBeenCalled();
    });
  });

  // ── POST /admin/resume ──

  describe('POST /admin/resume', () => {
    it('resumes trading successfully', async () => {
      const res = await request(buildApp())
        .post('/admin/resume')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Trading resumed');
      expect(mockReset).toHaveBeenCalled();
      expect(mockResume).toHaveBeenCalled();
      expect(mockLogAudit).toHaveBeenCalled();
    });

    it('returns 500 when resume throws', async () => {
      mockResume.mockRejectedValue(new Error('Resume failed'));

      const res = await request(buildApp())
        .post('/admin/resume')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Resume failed');
    });

    it('returns 500 with default message for non-Error throw', async () => {
      mockResume.mockRejectedValue('string error');

      const res = await request(buildApp())
        .post('/admin/resume')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to resume trading');
    });

    it('returns 403 without admin key', async () => {
      const res = await request(buildApp())
        .post('/admin/resume');

      expect(res.status).toBe(403);
      expect(mockResume).not.toHaveBeenCalled();
    });
  });

  // ── GET /admin/status ──

  describe('GET /admin/status', () => {
    it('returns system status with trading active', async () => {
      mockGetStatus.mockResolvedValue({ state: 'CLOSED' });
      mockGetMetrics.mockResolvedValue({ isHalted: false });

      const res = await request(buildApp())
        .get('/admin/status')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.trading).toBe(true);
      expect(res.body.circuitBreaker.state).toBe('CLOSED');
      expect(res.body.drawdown.isHalted).toBe(false);
      expect(typeof res.body.timestamp).toBe('number');
    });

    it('returns trading false when circuit breaker is OPEN', async () => {
      mockGetStatus.mockResolvedValue({ state: 'OPEN' });
      mockGetMetrics.mockResolvedValue({ isHalted: false });

      const res = await request(buildApp())
        .get('/admin/status')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.trading).toBe(false);
    });

    it('returns trading false when drawdown is halted', async () => {
      mockGetStatus.mockResolvedValue({ state: 'CLOSED' });
      mockGetMetrics.mockResolvedValue({ isHalted: true });

      const res = await request(buildApp())
        .get('/admin/status')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.trading).toBe(false);
    });

    it('returns 500 on error', async () => {
      mockGetStatus.mockRejectedValue(new Error('Status fetch failed'));

      const res = await request(buildApp())
        .get('/admin/status')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Status fetch failed');
    });

    it('returns 500 with default message for non-Error throw', async () => {
      mockGetStatus.mockRejectedValue('string error');

      const res = await request(buildApp())
        .get('/admin/status')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch status');
    });

    it('returns 403 without admin key', async () => {
      const res = await request(buildApp())
        .get('/admin/status');

      expect(res.status).toBe(403);
      expect(mockGetStatus).not.toHaveBeenCalled();
    });
  });

  // ── GET /admin/circuit-breakers ──

  describe('GET /admin/circuit-breakers', () => {
    it('lists circuit breakers', async () => {
      mockGetStatus.mockResolvedValue({ state: 'CLOSED', failures: 0 });

      const res = await request(buildApp())
        .get('/admin/circuit-breakers')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('default');
      expect(res.body[0].state).toBe('CLOSED');
    });

    it('returns 500 on error', async () => {
      mockGetStatus.mockRejectedValue(new Error('CB error'));

      const res = await request(buildApp())
        .get('/admin/circuit-breakers')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to list circuit breakers');
    });

    it('returns 403 without admin key', async () => {
      const res = await request(buildApp())
        .get('/admin/circuit-breakers');

      expect(res.status).toBe(403);
      expect(mockGetStatus).not.toHaveBeenCalled();
    });
  });

  // ── POST /admin/circuit-breakers/:name/reset ──

  describe('POST /admin/circuit-breakers/:name/reset', () => {
    it('resets a circuit breaker by name', async () => {
      const res = await request(buildApp())
        .post('/admin/circuit-breakers/default/reset')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.name).toBe('default');
      expect(res.body.state).toBe('CLOSED');
      expect(mockReset).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      mockReset.mockRejectedValue(new Error('Reset failed'));

      const res = await request(buildApp())
        .post('/admin/circuit-breakers/default/reset')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to reset circuit breaker');
    });

    it('returns 403 without admin key', async () => {
      const res = await request(buildApp())
        .post('/admin/circuit-breakers/default/reset');

      expect(res.status).toBe(403);
    });
  });

  // ── POST /admin/circuit-breakers/reset-all ──

  describe('POST /admin/circuit-breakers/reset-all', () => {
    it('resets all circuit breakers', async () => {
      const res = await request(buildApp())
        .post('/admin/circuit-breakers/reset-all')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('All circuit breakers reset');
      expect(res.body.state).toBe('CLOSED');
      expect(mockReset).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      mockReset.mockRejectedValue(new Error('Reset all failed'));

      const res = await request(buildApp())
        .post('/admin/circuit-breakers/reset-all')
        .set('x-admin-key', ADMIN_KEY);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to reset all circuit breakers');
    });

    it('returns 403 without admin key', async () => {
      const res = await request(buildApp())
        .post('/admin/circuit-breakers/reset-all');

      expect(res.status).toBe(403);
    });
  });

  // ── requireAdminKey: 503 when ADMIN_API_KEY not configured ──

  describe('requireAdminKey: missing env', () => {
    it('returns 503 when ADMIN_API_KEY is not set', async () => {
      delete process.env.ADMIN_API_KEY;

      const res = await request(buildApp())
        .post('/admin/halt')
        .send({ reason: 'test' });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');
    });
  });
});
