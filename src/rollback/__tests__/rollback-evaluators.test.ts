/**
 * Unit tests for rollback evaluators (L0–L2).
 * Mocks Redis, prometheus-metrics, tracing, and logger.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

import {
  checkSignalsLoopHealth,
  checkKillSwitch,
  checkSwarmDisabled,
} from '../rollback-evaluators';

import {
  setQwenKillSwitch,
  setQwenDrawdownAutoDisabled,
} from '../../middleware/prometheus-metrics';

function makeRedis(overrides: Record<string, string | null> = {}): RedisClientType {
  const store = new Map<string, string | null>(Object.entries(overrides));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as RedisClientType;
}

const DEFAULT_CONFIG: RollbackConfig = {
  enableCrossInstanceSync: true,
  signalStalenessMs: 5 * 60_000,
  signalErrorRateThreshold: 0.5,
  paperGateMinDays: 30,
};

describe('checkSignalsLoopHealth', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns inactive when last_run_ts is fresh', async () => {
    const r = await checkSignalsLoopHealth(makeRedis({ 'Standard:signals:last_run_ts': String(Date.now() - 60_000) }), DEFAULT_CONFIG);
    expect(r.active).toBe(false);
    expect(r.layer).toBe(RollbackLayer.L0_SIGNALS);
  });
  it('returns active when last_run_ts is stale', async () => {
    const r = await checkSignalsLoopHealth(makeRedis({ 'Standard:signals:last_run_ts': String(Date.now() - 10 * 60_000) }), DEFAULT_CONFIG);
    expect(r.active).toBe(true);
    expect(r.reason).toContain('stale');
  });
  it('returns active when last_run_ts is missing', async () => {
    const r = await checkSignalsLoopHealth(makeRedis(), DEFAULT_CONFIG);
    expect(r.active).toBe(true);
    expect(r.reason).toContain('stale');
  });
  it('returns active on Redis error', async () => {
    const redis = { get: vi.fn(async () => { throw new Error('ECONNRESET'); }) } as unknown as RedisClientType;
    const r = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    expect(r.active).toBe(true);
    expect(r.metadata).toHaveProperty('error');
  });
  it('returns metadata with freshness and threshold', async () => {
    const r = await checkSignalsLoopHealth(makeRedis({ 'Standard:signals:last_run_ts': String(Date.now() - 30_000) }), DEFAULT_CONFIG);
    expect(r.metadata).toHaveProperty('freshness');
    expect(r.metadata).toHaveProperty('threshold', DEFAULT_CONFIG.signalStalenessMs);
  });
  it('returns exactly at boundary as inactive', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_724_400_000_000);
    try {
      const boundaryTs = 1_724_400_000_000 - DEFAULT_CONFIG.signalStalenessMs;
      const r = await checkSignalsLoopHealth(makeRedis({ 'Standard:signals:last_run_ts': String(boundaryTs) }), DEFAULT_CONFIG);
      expect(r.active).toBe(false);
    } finally { vi.restoreAllMocks(); }
  });
});

describe('checkKillSwitch', () => {
  const originalEnv = process.env;
  beforeEach(() => { vi.clearAllMocks(); process.env = { ...originalEnv }; delete process.env.Standard_KILL; });
  afterEach(() => { process.env = originalEnv; });
  it('returns inactive when env var unset and redis key absent', async () => {
    const r = await checkKillSwitch(makeRedis());
    expect(r.active).toBe(false);
    expect(r.layer).toBe(RollbackLayer.L1_KILL);
  });
  it('returns active when Standard_KILL env var is "1"', async () => {
    process.env.Standard_KILL = '1';
    const r = await checkKillSwitch(makeRedis());
    expect(r.active).toBe(true);
    expect(r.reason).toContain('Kill switch');
  });
  it('returns active when Redis kill:active is "1"', async () => {
    expect((await checkKillSwitch(makeRedis({ 'Standard:kill:active': '1' }))).active).toBe(true);
  });
  it('returns inactive when Redis kill:active is "0"', async () => {
    expect((await checkKillSwitch(makeRedis({ 'Standard:kill:active': '0' }))).active).toBe(false);
  });
  it('calls setQwenKillSwitch with env and kv labels', async () => {
    await checkKillSwitch(makeRedis({ 'Standard:kill:active': '1' }));
    expect(setQwenKillSwitch).toHaveBeenCalledWith('env', false);
    expect(setQwenKillSwitch).toHaveBeenCalledWith('kv', true);
  });
  it('env var takes priority over redis key', async () => {
    process.env.Standard_KILL = '1';
    expect((await checkKillSwitch(makeRedis({ 'Standard:kill:active': '0' }))).active).toBe(true);
  });
});

describe('checkSwarmDisabled', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns inactive when redis key absent', async () => {
    const r = await checkSwarmDisabled(makeRedis());
    expect(r.active).toBe(false);
    expect(r.layer).toBe(RollbackLayer.L2_DISABLED);
  });
  it('returns active when redis Standard:disabled is "1"', async () => {
    const r = await checkSwarmDisabled(makeRedis({ 'Standard:disabled': '1' }));
    expect(r.active).toBe(true);
    expect(r.reason).toContain('disabled');
  });
  it('returns inactive when redis Standard:disabled is "0"', async () => {
    expect((await checkSwarmDisabled(makeRedis({ 'Standard:disabled': '0' }))).active).toBe(false);
  });
  it('calls setQwenDrawdownAutoDisabled(true) when disabled', async () => {
    await checkSwarmDisabled(makeRedis({ 'Standard:disabled': '1' }));
    expect(setQwenDrawdownAutoDisabled).toHaveBeenCalledWith(true);
  });
  it('calls setQwenDrawdownAutoDisabled(false) when not disabled', async () => {
    await checkSwarmDisabled(makeRedis({ 'Standard:disabled': '0' }));
    expect(setQwenDrawdownAutoDisabled).toHaveBeenCalledWith(false);
  });
});
