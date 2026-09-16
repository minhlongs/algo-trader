/**
 * Qwen Rollback Harness — L1 & L2 Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryResult = vi.fn();
vi.mock('../../../db/postgres-client', () => ({
  query: (...args: unknown[]) => mockQueryResult(...args),
}));

vi.mock('../../signal/telegram-signal-pusher', () => ({
  telegramSignalPusher: { sendAdminAlert: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../platform/middleware/prometheus-metrics', () => ({
  qwenPaperPnlPct: { set: vi.fn() },
  qwenSignalsTotal: { inc: vi.fn() },
  setQwenDrawdownAutoDisabled: vi.fn(),
  setQwenKillSwitch: vi.fn(),
}));

vi.mock('../../shared/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  isQwenEnabled,
  isKillSwitchActive,
  disableQwen,
  enableQwen,
  resetDrawdownMonitorState,
  getLastBreachAt,
} from '../qwen-drawdown-monitor.js';
import {
  setEnv,
  clearQwenEnv,
  NOW,
  DAYS_31_MS,
  DAYS_10_MS,
} from './qwen-rollback-harness-fixtures';

describe('L1 — Kill Switch (QWEN_KILL env)', () => {
  beforeEach(() => {
    clearQwenEnv();
    resetDrawdownMonitorState();
    mockQueryResult.mockReset();
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
