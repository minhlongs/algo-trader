/**
 * Tests for POST /kill and POST /unkill endpoints in admin-qwen-routes.ts
 * Covers: auth, state side-effects, counter emission for audit trail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../../shared/db/postgres-client', () => ({
  query: vi.fn(),
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockDisableQwen, mockEnableQwen } = vi.hoisted(() => ({
  mockDisableQwen: vi.fn(),
  mockEnableQwen: vi.fn(),
}));
vi.mock('../../../../desk/wiring/qwen-drawdown-monitor', () => ({
  disableQwen: mockDisableQwen,
  enableQwen: mockEnableQwen,
  isQwenEnabled: vi.fn().mockReturnValue(true),
  isKillSwitchActive: vi.fn().mockReturnValue(false),
  getLastBreachAt: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../../desk/wiring/qwen-live-eligibility-gate', () => ({
  checkQwenEligibility: vi.fn().mockResolvedValue({ eligible: false, reason: 'paper gate' }),
}));

const { mockKillActionsCounter } = vi.hoisted(() => ({
  mockKillActionsCounter: { inc: vi.fn() },
}));
vi.mock('../../../middleware/prometheus-metrics', () => ({
  qwenStrategyReviewsResolvedTotal: { inc: vi.fn() },
  qwenStrategyReviewBacklogSize: { set: vi.fn() },
  qwenStrategyReviewOldestPendingAgeSec: { set: vi.fn() },
  qwenAdminKillActionsTotal: mockKillActionsCounter,
  qwenDrawdownPnlQueryErrorsTotal: { inc: vi.fn() },
}));

import { createAdminQwenRouter } from '../admin-qwen-routes';

const ADMIN_KEY = 'test-admin-key-xyz';

function buildApp() {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use('/qwen', createAdminQwenRouter());
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /qwen/kill', () => {
  beforeEach(() => {
    mockDisableQwen.mockReset();
    mockEnableQwen.mockReset();
    mockKillActionsCounter.inc.mockClear();
    delete process.env.QWEN_KILL;
  });

  it('returns 403 without admin key', async () => {
    const res = await request(buildApp()).post('/qwen/kill');
    expect(res.status).toBe(403);
    expect(mockKillActionsCounter.inc).not.toHaveBeenCalled();
  });

  it('sets QWEN_KILL=1, disables swarm, increments counter', async () => {
    const res = await request(buildApp())
      .post('/qwen/kill')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'killed', qwenKill: '1', qwenEnabled: false });
    expect(process.env.QWEN_KILL).toBe('1');
    expect(mockDisableQwen).toHaveBeenCalledOnce();
    expect(mockKillActionsCounter.inc).toHaveBeenCalledOnce();
    expect(mockKillActionsCounter.inc).toHaveBeenCalledWith({ action: 'kill' });
  });
});

describe('POST /qwen/unkill', () => {
  beforeEach(() => {
    mockDisableQwen.mockReset();
    mockEnableQwen.mockReset();
    mockKillActionsCounter.inc.mockClear();
    process.env.QWEN_KILL = '1';
  });

  it('returns 403 without admin key', async () => {
    const res = await request(buildApp()).post('/qwen/unkill');
    expect(res.status).toBe(403);
    expect(mockKillActionsCounter.inc).not.toHaveBeenCalled();
  });

  it('clears QWEN_KILL, re-enables swarm, increments counter with action=unkill', async () => {
    const res = await request(buildApp())
      .post('/qwen/unkill')
      .set('x-admin-key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'cleared', qwenKill: '0', qwenEnabled: true });
    expect(process.env.QWEN_KILL).toBe('0');
    expect(mockEnableQwen).toHaveBeenCalledOnce();
    expect(mockKillActionsCounter.inc).toHaveBeenCalledOnce();
    expect(mockKillActionsCounter.inc).toHaveBeenCalledWith({ action: 'unkill' });
  });
});
