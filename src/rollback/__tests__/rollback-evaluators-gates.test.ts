/**
 * Unit tests for rollback evaluators (L3–L4 gates).
 * Mocks Redis, prometheus-metrics, tracing, and logger.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RedisClientType } from '../../redis';
import type { RollbackConfig } from '../rollback-types';
import { RollbackLayer } from '../rollback-types';

vi.mock('../../shared/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../shared/utils/tracing', () => ({
  getTracer: () => ({
    startSpan: () => ({ setAttribute: vi.fn(), recordException: vi.fn(), end: vi.fn() }),
  }),
}));
vi.mock('../../middleware/prometheus-metrics', () => ({
  setQwenKillSwitch: vi.fn(),
  setQwenDrawdownAutoDisabled: vi.fn(),
  setQwenPaperGateDaysRemaining: vi.fn(),
}));

import { checkDrawdownTier, checkPaperGate } from '../rollback-evaluators';
import { setQwenPaperGateDaysRemaining } from '../../middleware/prometheus-metrics';

function makeRedis(overrides: Record<string, string | null> = {}): RedisClientType {
  const store = new Map<string, string | null>(Object.entries(overrides));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as RedisClientType;
}

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CONFIG: RollbackConfig = {
  enableCrossInstanceSync: true,
  signalStalenessMs: 5 * 60_000,
  signalErrorRateThreshold: 0.5,
  paperGateMinDays: 30,
};

describe('checkDrawdownTier', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns inactive when tier is absent', async () => {
    const r = await checkDrawdownTier(makeRedis());
    expect(r.active).toBe(false);
    expect(r.layer).toBe(RollbackLayer.L3_DRAWDOWN);
  });
  it('returns active when tier is HALT', async () => {
    const r = await checkDrawdownTier(makeRedis({ 'qwen:drawdown:tier': 'HALT' }));
    expect(r.active).toBe(true);
    expect(r.reason).toContain('HALT');
  });
  it('returns active when tier is HARD_STOP', async () => {
    const r = await checkDrawdownTier(makeRedis({ 'qwen:drawdown:tier': 'HARD_STOP' }));
    expect(r.active).toBe(true);
    expect(r.reason).toContain('HARD_STOP');
  });
  it('returns inactive when tier is a non-trigger value', async () => {
    expect((await checkDrawdownTier(makeRedis({ 'qwen:drawdown:tier': 'NORMAL' }))).active).toBe(false);
  });
  it('returns metadata with tier value', async () => {
    expect((await checkDrawdownTier(makeRedis({ 'qwen:drawdown:tier': 'HALT' }))).metadata).toEqual({ tier: 'HALT' });
  });
  it('rejects on Redis error', async () => {
    const redis = { get: vi.fn(async () => { throw new Error('timeout'); }) } as unknown as RedisClientType;
    await expect(checkDrawdownTier(redis)).rejects.toThrow();
  });
});

describe('checkPaperGate', () => {
  const config: RollbackConfig = { ...DEFAULT_CONFIG, paperGateMinDays: 30 };
  beforeEach(() => vi.clearAllMocks());
  it('returns active when Standard:paper:ineligible is "1"', async () => {
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '1' }), config);
    expect(r.active).toBe(true);
    expect(r.layer).toBe(RollbackLayer.L4_PAPER_GATE);
    expect(r.reason).toContain('ineligible');
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(config.paperGateMinDays);
  });
  it('returns active when no first_trade_age_ms recorded', async () => {
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '0' }), config);
    expect(r.active).toBe(true);
    expect(r.reason).toContain('No paper trades');
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(config.paperGateMinDays);
  });
  it('returns active when trade age is less than paperGateMinDays', async () => {
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '0', 'Standard:paper:first_trade_age_ms': String(10 * DAY) }), config);
    expect(r.active).toBe(true);
    expect(r.reason).toContain('remaining');
    expect(r.metadata?.eligible).toBe(false);
  });
  it('returns inactive when trade age meets paperGateMinDays', async () => {
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '0', 'Standard:paper:first_trade_age_ms': String(30 * DAY) }), config);
    expect(r.active).toBe(false);
    expect(r.metadata?.eligible).toBe(true);
    expect(r.metadata?.daysRemaining).toBe(0);
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(0);
  });
  it('returns inactive when trade age far exceeds paperGateMinDays', async () => {
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '0', 'Standard:paper:first_trade_age_ms': String(90 * DAY) }), config);
    expect(r.active).toBe(false);
    expect(r.metadata?.daysRemaining).toBe(0);
  });
  it('returns active on Redis error (fail-closed)', async () => {
    const redis = { get: vi.fn(async () => { throw new Error('ECONNRESET'); }) } as unknown as RedisClientType;
    const r = await checkPaperGate(redis, config);
    expect(r.active).toBe(true);
    expect(r.metadata).toHaveProperty('error');
  });
  it('calls setQwenPaperGateDaysRemaining with correct fractional days', async () => {
    const redis = makeRedis({ 'Standard:paper:ineligible': '0', 'Standard:paper:first_trade_age_ms': String(25 * DAY) });
    await checkPaperGate(redis, config);
    const calledDays = (setQwenPaperGateDaysRemaining as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledDays).toBeCloseTo(5, 0);
  });
  it('uses config.paperGateMinDays for remaining when no age recorded', async () => {
    const customConfig: RollbackConfig = { ...config, paperGateMinDays: 14 };
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '0' }), customConfig);
    expect(r.active).toBe(true);
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(14);
    expect(r.metadata?.daysRemaining).toBe(14);
  });
  it('returns daysRemaining as 0 when eligible', async () => {
    const r = await checkPaperGate(makeRedis({ 'Standard:paper:ineligible': '0', 'Standard:paper:first_trade_age_ms': String(60 * DAY) }), config);
    expect(r.metadata?.daysRemaining).toBe(0);
    expect(r.metadata?.eligible).toBe(true);
  });
});
