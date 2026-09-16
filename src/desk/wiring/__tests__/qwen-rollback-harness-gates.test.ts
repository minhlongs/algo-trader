/**
 * Qwen Rollback Harness — L3 & L4 Gate Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryResult = vi.fn();
vi.mock('../../../db/postgres-client', () => ({ query: (...a: unknown[]) => mockQueryResult(...a) }));
vi.mock('../../signal/telegram-signal-pusher', () => ({ telegramSignalPusher: { sendAdminAlert: vi.fn().mockResolvedValue(true) } }));
vi.mock('../../platform/middleware/prometheus-metrics', () => ({
  qwenPaperPnlPct: { set: vi.fn() }, qwenSignalsTotal: { inc: vi.fn() },
  setQwenDrawdownAutoDisabled: vi.fn(), setQwenKillSwitch: vi.fn(), setQwenPaperGateDaysRemaining: vi.fn(),
}));
vi.mock('../../shared/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { isQwenEnabled, disableQwen, computeRollingPnl, runDrawdownCheck, resetDrawdownMonitorState } from '../qwen-drawdown-monitor.js';
import { assertQwenLiveEligible, checkQwenEligibility, PaperGateError } from '../qwen-live-eligibility-gate.js';
import { telegramSignalPusher } from '../../signal/telegram-signal-pusher';
import { setEnv, clearQwenEnv, NOW, DAYS_31_MS, DAYS_10_MS } from './qwen-rollback-harness-fixtures';

const getMockAlert = () => vi.mocked(telegramSignalPusher.sendAdminAlert);

describe('L3 — Drawdown Auto-Disable (24h rolling P&L)', () => {
  beforeEach(() => {
    clearQwenEnv();
    resetDrawdownMonitorState();
    mockQueryResult.mockReset();
    getMockAlert().mockReset();
    getMockAlert().mockResolvedValue(true);
  });

  it('computeRollingPnl returns pnlPct=null when no closed trades', async () => {
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 0, total_pnl: 0 }] });
    const result = await computeRollingPnl('qwen');
    expect(result.pnlPct).toBeNull();
  });

  it('computeRollingPnl computes correct pnl percentage', async () => {
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -60 }] });
    const result = await computeRollingPnl('qwen');
    expect(result.pnlPct).toBeCloseTo(-0.06);
    expect(result.totalSize).toBe(1000);
    expect(result.totalPnl).toBe(-60);
  });

  it('runDrawdownCheck disables Qwen when drawdown exceeds 5% threshold', async () => {
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -60 }] });
    await runDrawdownCheck();
    expect(isQwenEnabled()).toBe(false);
  });

  it('runDrawdownCheck sends exactly one Telegram alert on breach', async () => {
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -60 }] });
    await runDrawdownCheck();
    expect(getMockAlert()).toHaveBeenCalledTimes(1);
    expect(getMockAlert().mock.calls[0][0]).toContain('drawdown');
  });

  it('runDrawdownCheck does NOT disable when drawdown is within threshold', async () => {
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -30 }] });
    await runDrawdownCheck();
    expect(isQwenEnabled()).toBe(true);
    expect(getMockAlert()).not.toHaveBeenCalled();
  });

  it('runDrawdownCheck skips check when already disabled (no double-alert)', async () => {
    disableQwen('pre-disabled');
    await runDrawdownCheck();
    expect(mockQueryResult).not.toHaveBeenCalled();
    expect(getMockAlert()).not.toHaveBeenCalled();
  });

  it('respects custom QWEN_DRAWDOWN_MAX_PCT env (10%)', async () => {
    setEnv({ QWEN_DRAWDOWN_MAX_PCT: '10' });
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -80 }] });
    await runDrawdownCheck();
    expect(isQwenEnabled()).toBe(true);
  });
});

describe('L4 — 30-Day Paper Gate + USD Cap', () => {
  beforeEach(() => {
    clearQwenEnv();
    resetDrawdownMonitorState();
    mockQueryResult.mockReset();
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: null }] });
  });

  it('assertQwenLiveEligible throws when QWEN_LIVE_ELIGIBLE not set', async () => {
    await expect(assertQwenLiveEligible(100)).rejects.toThrow(PaperGateError);
    await expect(assertQwenLiveEligible(100)).rejects.toThrow('not enabled');
  });

  it('assertQwenLiveEligible throws when no paper trades exist', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'true' });
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: null }] });
    await expect(assertQwenLiveEligible(100)).rejects.toThrow(PaperGateError);
    await expect(assertQwenLiveEligible(100)).rejects.toThrow('No paper trades recorded yet');
  });

  it('assertQwenLiveEligible throws when paper history < 30 days', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'true' });
    const tenDaysAgo = NOW - DAYS_10_MS;
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: tenDaysAgo }] });
    await expect(assertQwenLiveEligible(100)).rejects.toThrow(PaperGateError);
    await expect(assertQwenLiveEligible(100)).rejects.toThrow('30d paper validation');
  });

  it('assertQwenLiveEligible throws when trade size exceeds $500 cap', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'true', QWEN_AUTO_APPROVE_MAX_USD: '500' });
    const thirtyOneDaysAgo = NOW - DAYS_31_MS;
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: thirtyOneDaysAgo }] });
    await expect(assertQwenLiveEligible(600)).rejects.toThrow(PaperGateError);
    await expect(assertQwenLiveEligible(600)).rejects.toThrow('auto-approve limit');
  });

  it('assertQwenLiveEligible passes when all gates clear', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'true', QWEN_AUTO_APPROVE_MAX_USD: '500' });
    const thirtyOneDaysAgo = NOW - DAYS_31_MS;
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: thirtyOneDaysAgo }] });
    await expect(assertQwenLiveEligible(100)).resolves.toBeUndefined();
  });

  it('checkQwenEligibility returns eligible=false when QWEN_LIVE_ELIGIBLE=false', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'false' });
    const result = await checkQwenEligibility(100);
    expect(result.eligible).toBe(false);
  });

  it('checkQwenEligibility flags requiresManualApproval for oversized trades post-30d', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'true', QWEN_AUTO_APPROVE_MAX_USD: '500' });
    const thirtyOneDaysAgo = NOW - DAYS_31_MS;
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: thirtyOneDaysAgo }] });
    const result = await checkQwenEligibility(1000);
    expect(result.eligible).toBe(true);
    expect(result.requiresManualApproval).toBe(true);
  });
});
