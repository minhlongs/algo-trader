/**
 * Qwen Rollback Harness — 4-tier rollback layer tests.
 *
 * L1 — Kill switch: QWEN_KILL=1 blocks all signal ingestion (503)
 * L2 — Swarm disable: isQwenEnabled()=false blocks orchestrator processing
 * L3 — Drawdown auto-disable: 24h P&L breach triggers disable + alert
 * L4 — 30-day paper gate: MIN_PAPER_DAYS hard gate + $500 USD cap
 *
 * Each layer is tested in isolation with mocked DB/Telegram.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock DB to avoid real Postgres in unit tests ────────────────────────────
const mockQueryResult = vi.fn();
vi.mock('../../db/postgres-client.js', () => ({
  query: (...args: unknown[]) => mockQueryResult(...args),
}));

// ─── Mock Telegram to avoid real HTTP calls ──────────────────────────────────
// Note: vi.fn() inside factory — cannot reference outer variables (hoisting)
vi.mock('../../signal/telegram-signal-pusher.js', () => ({
  telegramSignalPusher: { sendAdminAlert: vi.fn().mockResolvedValue(true) },
}));

// ─── Mock Prometheus to avoid duplicate metric registration ──────────────────
vi.mock('../../middleware/prometheus-metrics.js', () => ({
  qwenPaperPnlPct: { set: vi.fn() },
  qwenSignalsTotal: { inc: vi.fn() },
  setQwenKillSwitch: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
}));

// ─── Mock logger ─────────────────────────────────────────────────────────────
vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  isQwenEnabled,
  isKillSwitchActive,
  disableQwen,
  enableQwen,
  computeRollingPnl,
  runDrawdownCheck,
  resetDrawdownMonitorState,
  getLastBreachAt,
} from '../qwen-drawdown-monitor.js';

import {
  assertQwenLiveEligible,
  checkQwenEligibility,
  PaperGateError,
} from '../qwen-live-eligibility-gate.js';

import { telegramSignalPusher } from '../../signal/telegram-signal-pusher.js';

// Convenience accessor for the mocked sendAdminAlert (resolved after imports)
const getMockAlert = () => vi.mocked(telegramSignalPusher.sendAdminAlert);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = Date.now();
const DAYS_31_MS = 31 * 24 * 60 * 60 * 1000;
const DAYS_10_MS = 10 * 24 * 60 * 60 * 1000;

function setEnv(overrides: Record<string, string>) {
  Object.assign(process.env, overrides);
}

function clearQwenEnv() {
  delete process.env.QWEN_KILL;
  delete process.env.QWEN_LIVE_ELIGIBLE;
  delete process.env.QWEN_AUTO_APPROVE_MAX_USD;
  delete process.env.QWEN_DRAWDOWN_MAX_PCT;
}

// ─── L1: Kill Switch ─────────────────────────────────────────────────────────

describe('L1 — Kill Switch (QWEN_KILL env)', () => {
  beforeEach(() => {
    clearQwenEnv();
    resetDrawdownMonitorState();
    mockQueryResult.mockReset();
    getMockAlert().mockReset();
  });

  it('isKillSwitchActive() returns false when QWEN_KILL not set', () => {
    expect(isKillSwitchActive()).toBe(false);
  });

  it('isKillSwitchActive() returns true when QWEN_KILL=1', () => {
    setEnv({ QWEN_KILL: '1' });
    expect(isKillSwitchActive()).toBe(true);
  });

  it('isQwenEnabled() returns false when kill switch active (L1 overrides L2)', () => {
    setEnv({ QWEN_KILL: '1' });
    expect(isQwenEnabled()).toBe(false);
  });

  it('isQwenEnabled() returns true when QWEN_KILL=0 and swarm not disabled', () => {
    setEnv({ QWEN_KILL: '0' });
    expect(isQwenEnabled()).toBe(true);
  });
});

// ─── L2: Swarm Disable ───────────────────────────────────────────────────────

describe('L2 — Swarm Disable (in-memory flag)', () => {
  beforeEach(() => {
    clearQwenEnv();
    resetDrawdownMonitorState();
  });

  it('isQwenEnabled() returns true on fresh state', () => {
    expect(isQwenEnabled()).toBe(true);
  });

  it('disableQwen() sets enabled=false', () => {
    disableQwen('test');
    expect(isQwenEnabled()).toBe(false);
  });

  it('enableQwen() restores enabled=true after disable', () => {
    disableQwen('test');
    enableQwen();
    expect(isQwenEnabled()).toBe(true);
  });

  it('disableQwen() records lastBreachAt timestamp', () => {
    const before = Date.now();
    disableQwen('breach');
    const after = Date.now();
    const ts = getLastBreachAt();
    expect(ts).not.toBeNull();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after);
  });

  it('enableQwen() clears lastBreachAt', () => {
    disableQwen('breach');
    enableQwen();
    expect(getLastBreachAt()).toBeNull();
  });
});

// ─── L3: Drawdown Auto-Disable ───────────────────────────────────────────────

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
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -30 }] }); // -3% < 5%
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
    // -8% should NOT breach 10% threshold
    mockQueryResult.mockResolvedValue({ rows: [{ total_size: 1000, total_pnl: -80 }] });
    await runDrawdownCheck();
    expect(isQwenEnabled()).toBe(true);
  });
});

// ─── L4: 30-Day Paper Gate + USD Cap ─────────────────────────────────────────

describe('L4 — 30-Day Paper Gate + USD Cap', () => {
  beforeEach(() => {
    clearQwenEnv();
    resetDrawdownMonitorState();
    mockQueryResult.mockReset();
  });

  it('assertQwenLiveEligible throws when QWEN_LIVE_ELIGIBLE not set', async () => {
    await expect(assertQwenLiveEligible(100)).rejects.toThrow(PaperGateError);
    await expect(assertQwenLiveEligible(100)).rejects.toThrow('not enabled');
  });

  it('assertQwenLiveEligible throws when no paper trades exist', async () => {
    setEnv({ QWEN_LIVE_ELIGIBLE: 'true' });
    mockQueryResult.mockResolvedValue({ rows: [{ min_ts: null }] });
    await expect(assertQwenLiveEligible(100)).rejects.toThrow(PaperGateError);
    await expect(assertQwenLiveEligible(100)).rejects.toThrow('No Qwen paper trades');
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
