/**
 * Tests for GET /signals-loop/runs endpoint in admin-qwen-routes.ts
 * Covers: auth, default limit, decision filter, limit cap, DB error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();
vi.mock('../../../../shared/db/postgres-client.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('../../../../shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../wiring/qwen-drawdown-monitor.js', () => ({
  disableQwen: vi.fn(),
  enableQwen: vi.fn(),
  isQwenEnabled: vi.fn().mockReturnValue(true),
  isKillSwitchActive: vi.fn().mockReturnValue(false),
  getLastBreachAt: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../wiring/qwen-live-eligibility-gate.js', () => ({
  checkQwenEligibility: vi.fn().mockResolvedValue({ eligible: false, reason: 'paper gate' }),
}));

import { createAdminQwenRouter } from '../admin-qwen-routes.js';

// ─── App factory ─────────────────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-xyz';

function buildApp() {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use('/qwen', createAdminQwenRouter());
  return app;
}

// ─── Sample run row ───────────────────────────────────────────────────────────

const SAMPLE_RUN = {
  id: 'aaaaaaaa-1111-2222-3333-eeeeeeeeeeee',
  source: 'qwen-m1max',
  ran_at: '2026-04-17T03:00:00Z',
  metrics: { winRate: 0.3, sharpe: null, signalCount: 25, closedTradeCount: 20 },
  decision: 'queued_review',
  trigger_reasons: ['win_rate_below_threshold'],
  error_message: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /qwen/signals-loop/runs', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns 403 when X-Admin-Key is missing', async () => {
    const res = await request(buildApp()).get('/qwen/signals-loop/runs');
    expect(res.status).toBe(403);
  });

  it('returns runs array with default limit=50 and no decision filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [SAMPLE_RUN] });

    const res = await request(buildApp())
      .get('/qwen/signals-loop/runs')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.runs).toHaveLength(1);

    // Verify query uses limit=50 (no decision filter branch)
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(50);
  });

  it('passes decision filter to query when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp())
      .get('/qwen/signals-loop/runs?decision=queued_review')
      .set('x-admin-key', ADMIN_KEY);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('decision = $1');
    expect(params[0]).toBe('queued_review');
    expect(params[1]).toBe(50); // default limit
  });

  it('caps limit at 200', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(buildApp())
      .get('/qwen/signals-loop/runs?limit=9999')
      .set('x-admin-key', ADMIN_KEY);

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // No decision filter → limit is params[0]
    expect(params[0]).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    const res = await request(buildApp())
      .get('/qwen/signals-loop/runs')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to fetch signals loop runs/);
  });
});
