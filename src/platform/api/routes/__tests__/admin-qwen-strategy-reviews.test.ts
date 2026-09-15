import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { ADMIN_KEY, SAMPLE_REVIEW, buildAdminQwenApp } from './admin-qwen-strategy-reviews-fixtures';

const mockQuery = vi.fn();
vi.mock('../../../../shared/db/postgres-client', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../wiring/qwen-drawdown-monitor', () => ({
  disableQwen: vi.fn(),
  enableQwen: vi.fn(),
  isQwenEnabled: vi.fn().mockReturnValue(true),
  isKillSwitchActive: vi.fn().mockReturnValue(false),
  getLastBreachAt: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../wiring/qwen-live-eligibility-gate', () => ({
  checkQwenEligibility: vi.fn().mockResolvedValue({ eligible: false, reason: 'paper gate' }),
}));

vi.mock('../../../middleware/prometheus-metrics', () => ({
  qwenStrategyReviewsResolvedTotal: { inc: vi.fn() },
  qwenStrategyReviewBacklogSize: { set: vi.fn() },
  qwenStrategyReviewOldestPendingAgeSec: { set: vi.fn() },
  qwenAdminKillActionsTotal: { inc: vi.fn() },
  qwenDrawdownPnlQueryErrorsTotal: { inc: vi.fn() },
}));

import { createAdminQwenRouter } from '../admin-qwen-routes';

describe('GET /qwen/strategy-reviews', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 403 when X-Admin-Key is missing', async () => {
    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app).get('/qwen/strategy-reviews');
    expect(res.status).toBe(403);
  });

  it('returns 403 when X-Admin-Key is wrong', async () => {
    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', 'wrong-key');
    expect(res.status).toBe(403);
  });

  it('returns reviews array with count on success (default params)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_REVIEW] });

    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].trigger_reason).toBe('win_rate_below_threshold');
  });

  it('passes default source=qwen-m1max and status=pending to query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildAdminQwenApp(createAdminQwenRouter());
    await request(app)
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('strategy_review_tasks');
    expect(params[0]).toBe('qwen-m1max');
    expect(params[1]).toBe('pending');
    expect(params[2]).toBe(50);
  });

  it('respects custom status and source query params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildAdminQwenApp(createAdminQwenRouter());
    await request(app)
      .get('/qwen/strategy-reviews?status=resolved&source=deepseek&limit=10')
      .set('x-admin-key', ADMIN_KEY);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('deepseek');
    expect(params[1]).toBe('resolved');
    expect(params[2]).toBe(10);
  });

  it('caps limit at 200', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildAdminQwenApp(createAdminQwenRouter());
    await request(app)
      .get('/qwen/strategy-reviews?limit=9999')
      .set('x-admin-key', ADMIN_KEY);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(200);
  });

  it('returns empty reviews array when no tasks match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.reviews).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
      .get('/qwen/strategy-reviews')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch strategy reviews/);
  });
});
