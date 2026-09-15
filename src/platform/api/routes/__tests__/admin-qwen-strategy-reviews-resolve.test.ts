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

const { mockResolvedCounter } = vi.hoisted(() => ({
  mockResolvedCounter: { inc: vi.fn() },
}));
vi.mock('../../../middleware/prometheus-metrics', () => ({
  qwenStrategyReviewsResolvedTotal: mockResolvedCounter,
  qwenStrategyReviewBacklogSize: { set: vi.fn() },
  qwenStrategyReviewOldestPendingAgeSec: { set: vi.fn() },
  qwenAdminKillActionsTotal: { inc: vi.fn() },
  qwenDrawdownPnlQueryErrorsTotal: { inc: vi.fn() },
}));

import { createAdminQwenRouter } from '../admin-qwen-routes';

describe('POST /qwen/strategy-reviews/:id/resolve', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockResolvedCounter.inc.mockClear();
  });

  it('returns 403 when X-Admin-Key is missing', async () => {
    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app).post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`);
    expect(res.status).toBe(403);
  });

  it('returns 200 + updated row on successful resolve', async () => {
    const resolvedRow = {
      ...SAMPLE_REVIEW,
      status: 'resolved',
      resolved_at: '2026-04-17T12:00:00Z',
    };
    mockQuery.mockResolvedValueOnce({ rows: [resolvedRow] });

    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
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

    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
      .post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`)
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found or already resolved/);
    expect(mockResolvedCounter.inc).not.toHaveBeenCalled();
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    const app = buildAdminQwenApp(createAdminQwenRouter());
    const res = await request(app)
      .post(`/qwen/strategy-reviews/${SAMPLE_REVIEW.id}/resolve`)
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to resolve strategy review/);
    expect(mockResolvedCounter.inc).not.toHaveBeenCalled();
  });
});
