/**
 * Tests for GET /strategy-reviews endpoint in admin-qwen-routes.ts
 * Covers: auth, default params, custom params, limit cap, DB error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
vi.mock('../../../db/postgres-client.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../wiring/qwen-drawdown-monitor.js', () => ({
  disableQwen: vi.fn(),
  enableQwen: vi.fn(),
  isQwenEnabled: vi.fn().mockReturnValue(true),
  isKillSwitchActive: vi.fn().mockReturnValue(false),
  getLastBreachAt: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../wiring/qwen-live-eligibility-gate.js', () => ({
  checkQwenEligibility: vi.fn().mockResolvedValue({ eligible: false, reason: 'paper gate' }),
}));

// Prometheus counter — admin-qwen-routes now imports qwenStrategyReviewsResolvedTotal
const { mockResolvedCounter } = vi.hoisted(() => ({
  mockResolvedCounter: { inc: vi.fn() },
}));
vi.mock('../../../middleware/prometheus-metrics.js', () => ({
  qwenStrategyReviewsResolvedTotal: mockResolvedCounter,
  qwenStrategyReviewBacklogSize: { set: vi.fn() },
  qwenStrategyReviewOldestPendingAgeSec: { set: vi.fn() },
}));

import { createAdminQwenRouter } from '../admin-qwen-routes.js';

// ─── App factory ─────────────────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-abc';

function buildApp() {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use('/qwen', createAdminQwenRouter());
  return app;
}

// ─── Sample review row ────────────────────────────────────────────────────────

const SAMPLE_REVIEW = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  source: 'qwen-m1max',
  trigger_reason: 'win_rate_below_threshold',
  metrics: { winRate: 0.3, sharpe: null, signalCount: 25, closedTradeCount: 20 },
  status: 'pending',
  created_at: '2026-04-17T10:00:00Z',
  resolved_at: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /qwen/strategy-reviews', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 403 when X-Admin-Key is missing', async () => {
    const res = await request(buildApp()).get('/qwen/strategy-reviews');
    expect(res.status).toBe(403);
  });

  it('returns 403 when X-Admin-Key is wrong', async () => {
    const res = await request(buildApp())
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', 'wrong-key');
    expect(res.status).toBe(403);
  });

  it('returns reviews array with count on success (default params)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_REVIEW] });

    const res = await request(buildApp())
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].trigger_reason).toBe('win_rate_below_threshold');
  });

  it('passes default source=qwen-m1max and status=pending to query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp())
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('strategy_review_tasks');
    expect(params[0]).toBe('qwen-m1max');
    expect(params[1]).toBe('pending');
    expect(params[2]).toBe(50); // default limit
  });

  it('respects custom status and source query params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp())
      .get('/qwen/strategy-reviews?status=resolved&source=deepseek&limit=10')
      .set('x-admin-key', ADMIN_KEY);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('deepseek');
    expect(params[1]).toBe('resolved');
    expect(params[2]).toBe(10);
  });

  it('caps limit at 200', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp())
      .get('/qwen/strategy-reviews?limit=9999')
      .set('x-admin-key', ADMIN_KEY);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(200);
  });

  it('returns empty reviews array when no tasks match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp())
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await request(buildApp())
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch strategy reviews/);
  });
});

describe('POST /qwen/strategy-reviews/:id/resolve', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolvedCounter.inc.mockClear();
  });

  it('returns 403 when X-Admin-Key is missing', async () => {
    const res = await request(buildApp()).post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`);
    expect(res.status).toBe(403);
  });

  it('returns 200 + updated row on successful resolve', async () => {
    const resolvedRow = {
      ...SAMPLE_REVIEW,
      status: 'resolved',
      resolved_at: '2026-04-17T12:00:00Z',
    };
    mockQuery.mockResolvedValueOnce({ rows: [resolvedRow] });

    const res = await request(buildApp())
      .post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`)
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.resolved).toMatchObject({ id: SAMPLE_REVIEW.id, status: 'resolved' });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'resolved'");
    expect(sql).toContain("WHERE id = $1 AND status = 'pending'");
    expect(params[0]).toBe(SAMPLE_REVIEW.id);

    expect(mockResolvedCounter.inc).toHaveBeenCalledOnce();
    expect(mockResolvedCounter.inc).toHaveBeenCalledWith({ reason: 'win_rate_below_threshold' });
  });

  it('returns 404 when id not found or already resolved (UPDATE affects 0 rows)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp())
      .post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`)
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found or already resolved/);
    expect(mockResolvedCounter.inc).not.toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await request(buildApp())
      .post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`)
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to resolve strategy review/);
    expect(mockResolvedCounter.inc).not.toHaveBeenCalled();
  });
});
