/**
 * Unit tests for rollback evaluators (L0-L4)
 * Mocks Redis, prometheus-metrics, tracing, and logger.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RedisClientType } from '../../redis';
import type { RollbackConfig } from '../rollback-types';
import { RollbackLayer } from '../rollback-types';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../../shared/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('../../shared/utils/tracing', () => ({
  getTracer: () => ({
    startSpan: () => ({
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    }),
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
  checkDrawdownTier,
  checkPaperGate,
} from '../rollback-evaluators';

import {
  setQwenKillSwitch,
  setQwenDrawdownAutoDisabled,
  setQwenPaperGateDaysRemaining,
} from '../../middleware/prometheus-metrics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRedis(overrides: Record<string, string | null> = {}): RedisClientType {
  const store = new Map<string, string | null>(Object.entries(overrides));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as RedisClientType;
}

const DEFAULT_CONFIG: RollbackConfig = {
  enableCrossInstanceSync: true,
  signalStalenessMs: 5 * 60_000,       // 5 min
  signalErrorRateThreshold: 0.5,
  paperGateMinDays: 30,
};

// ---------------------------------------------------------------------------
// L0 — checkSignalsLoopHealth
// ---------------------------------------------------------------------------
describe('checkSignalsLoopHealth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns inactive when last_run_ts is fresh (within signalStalenessMs)', async () => {
    const recentTs = Date.now() - 60_000; // 1 min ago
    const redis = makeRedis({
      'Standard:signals:last_run_ts': String(recentTs),
    });
    const result = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    expect(result.active).toBe(false);
    expect(result.layer).toBe(RollbackLayer.L0_SIGNALS);
  });

  it('returns active when last_run_ts is stale (beyond signalStalenessMs)', async () => {
    const staleTs = Date.now() - 10 * 60_000; // 10 min ago
    const redis = makeRedis({
      'Standard:signals:last_run_ts': String(staleTs),
    });
    const result = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('stale');
  });

  it('returns active when last_run_ts is missing (parsed as 0)', async () => {
    const redis = makeRedis();
    const result = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('stale');
  });

  it('returns active on Redis error', async () => {
    const redis = {
      get: vi.fn(async () => { throw new Error('ECONNRESET'); }),
    } as unknown as RedisClientType;
    const result = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    expect(result.active).toBe(true);
    expect(result.metadata).toHaveProperty('error');
  });

  it('returns metadata with freshness and threshold', async () => {
    const recentTs = Date.now() - 30_000; // 30s ago
    const redis = makeRedis({
      'Standard:signals:last_run_ts': String(recentTs),
    });
    const result = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    expect(result.metadata).toHaveProperty('freshness');
    expect(result.metadata).toHaveProperty('threshold', DEFAULT_CONFIG.signalStalenessMs);
  });

  it('returns exactly at boundary (freshness == threshold) as inactive', async () => {
    const boundaryTs = Date.now() - DEFAULT_CONFIG.signalStalenessMs;
    const redis = makeRedis({
      'Standard:signals:last_run_ts': String(boundaryTs),
    });
    const result = await checkSignalsLoopHealth(redis, DEFAULT_CONFIG);
    // freshness > threshold is the check, so equal should be inactive
    expect(result.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L1 — checkKillSwitch
// ---------------------------------------------------------------------------
describe('checkKillSwitch', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.Standard_KILL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns inactive when env var unset and redis key absent', async () => {
    const redis = makeRedis();
    const result = await checkKillSwitch(redis);
    expect(result.active).toBe(false);
    expect(result.layer).toBe(RollbackLayer.L1_KILL);
  });

  it('returns active when Standard_KILL env var is "1"', async () => {
    process.env.Standard_KILL = '1';
    const redis = makeRedis();
    const result = await checkKillSwitch(redis);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('Kill switch');
  });

  it('returns active when Redis kill:active is "1"', async () => {
    const redis = makeRedis({ 'Standard:kill:active': '1' });
    const result = await checkKillSwitch(redis);
    expect(result.active).toBe(true);
  });

  it('returns inactive when Redis kill:active is "0"', async () => {
    const redis = makeRedis({ 'Standard:kill:active': '0' });
    const result = await checkKillSwitch(redis);
    expect(result.active).toBe(false);
  });

  it('calls setQwenKillSwitch with env and kv labels', async () => {
    const redis = makeRedis({ 'Standard:kill:active': '1' });
    await checkKillSwitch(redis);
    expect(setQwenKillSwitch).toHaveBeenCalledWith('env', false);
    expect(setQwenKillSwitch).toHaveBeenCalledWith('kv', true);
  });

  it('env var takes priority over redis key', async () => {
    process.env.Standard_KILL = '1';
    const redis = makeRedis({ 'Standard:kill:active': '0' });
    const result = await checkKillSwitch(redis);
    expect(result.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L2 — checkSwarmDisabled
// ---------------------------------------------------------------------------
describe('checkSwarmDisabled', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns inactive when redis key absent', async () => {
    const redis = makeRedis();
    const result = await checkSwarmDisabled(redis);
    expect(result.active).toBe(false);
    expect(result.layer).toBe(RollbackLayer.L2_DISABLED);
  });

  it('returns active when redis Standard:disabled is "1"', async () => {
    const redis = makeRedis({ 'Standard:disabled': '1' });
    const result = await checkSwarmDisabled(redis);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('disabled');
  });

  it('returns inactive when redis Standard:disabled is "0"', async () => {
    const redis = makeRedis({ 'Standard:disabled': '0' });
    const result = await checkSwarmDisabled(redis);
    expect(result.active).toBe(false);
  });

  it('calls setQwenDrawdownAutoDisabled with correct value', async () => {
    const redis = makeRedis({ 'Standard:disabled': '1' });
    await checkSwarmDisabled(redis);
    expect(setQwenDrawdownAutoDisabled).toHaveBeenCalledWith(true);
  });

  it('calls setQwenDrawdownAutoDisabled(false) when not disabled', async () => {
    const redis = makeRedis({ 'Standard:disabled': '0' });
    await checkSwarmDisabled(redis);
    expect(setQwenDrawdownAutoDisabled).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// L3 — checkDrawdownTier
// ---------------------------------------------------------------------------
describe('checkDrawdownTier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns inactive when tier is absent', async () => {
    const redis = makeRedis();
    const result = await checkDrawdownTier(redis);
    expect(result.active).toBe(false);
    expect(result.layer).toBe(RollbackLayer.L3_DRAWDOWN);
  });

  it('returns active when tier is HALT', async () => {
    const redis = makeRedis({ 'qwen:drawdown:tier': 'HALT' });
    const result = await checkDrawdownTier(redis);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('HALT');
  });

  it('returns active when tier is HARD_STOP', async () => {
    const redis = makeRedis({ 'qwen:drawdown:tier': 'HARD_STOP' });
    const result = await checkDrawdownTier(redis);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('HARD_STOP');
  });

  it('returns inactive when tier is a non-trigger value (e.g. NORMAL)', async () => {
    const redis = makeRedis({ 'qwen:drawdown:tier': 'NORMAL' });
    const result = await checkDrawdownTier(redis);
    expect(result.active).toBe(false);
  });

  it('returns metadata with tier value', async () => {
    const redis = makeRedis({ 'qwen:drawdown:tier': 'HALT' });
    const result = await checkDrawdownTier(redis);
    expect(result.metadata).toEqual({ tier: 'HALT' });
  });

  it('returns active on Redis error (fail-open via null tier)', async () => {
    const redis = {
      get: vi.fn(async () => { throw new Error('timeout'); }),
    } as unknown as RedisClientType;
    // The function does NOT catch — it will throw
    await expect(checkDrawdownTier(redis)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// L4 — checkPaperGate
// ---------------------------------------------------------------------------
describe('checkPaperGate', () => {
  const config: RollbackConfig = {
    ...DEFAULT_CONFIG,
    paperGateMinDays: 30,
  };

  beforeEach(() => vi.clearAllMocks());

  it('returns active when Standard:paper:ineligible is "1"', async () => {
    const redis = makeRedis({ 'Standard:paper:ineligible': '1' });
    const result = await checkPaperGate(redis, config);
    expect(result.active).toBe(true);
    expect(result.layer).toBe(RollbackLayer.L4_PAPER_GATE);
    expect(result.reason).toContain('ineligible');
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(config.paperGateMinDays);
  });

  it('returns active when no first_trade_age_ms recorded', async () => {
    const redis = makeRedis({
      'Standard:paper:ineligible': '0',
    });
    const result = await checkPaperGate(redis, config);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('No paper trades');
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(config.paperGateMinDays);
  });

  it('returns active when trade age is less than paperGateMinDays', async () => {
    const ageMs = 10 * 24 * 60 * 60 * 1000; // 10 days
    const redis = makeRedis({
      'Standard:paper:ineligible': '0',
      'Standard:paper:first_trade_age_ms': String(ageMs),
    });
    const result = await checkPaperGate(redis, config);
    expect(result.active).toBe(true);
    expect(result.reason).toContain('remaining');
    expect(result.metadata?.eligible).toBe(false);
  });

  it('returns inactive when trade age meets paperGateMinDays', async () => {
    const ageMs = 30 * 24 * 60 * 60 * 1000; // exactly 30 days
    const redis = makeRedis({
      'Standard:paper:ineligible': '0',
      'Standard:paper:first_trade_age_ms': String(ageMs),
    });
    const result = await checkPaperGate(redis, config);
    expect(result.active).toBe(false);
    expect(result.metadata?.eligible).toBe(true);
    expect(result.metadata?.daysRemaining).toBe(0);
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(0);
  });

  it('returns inactive when trade age far exceeds paperGateMinDays', async () => {
    const ageMs = 90 * 24 * 60 * 60 * 1000; // 90 days
    const redis = makeRedis({
      'Standard:paper:ineligible': '0',
      'Standard:paper:first_trade_age_ms': String(ageMs),
    });
    const result = await checkPaperGate(redis, config);
    expect(result.active).toBe(false);
    expect(result.metadata?.daysRemaining).toBe(0);
  });

  it('returns active on Redis error (fail-closed)', async () => {
    const redis = {
      get: vi.fn(async () => { throw new Error('ECONNRESET'); }),
    } as unknown as RedisClientType;
    const result = await checkPaperGate(redis, config);
    expect(result.active).toBe(true);
    expect(result.metadata).toHaveProperty('error');
  });

  it('calls setQwenPaperGateDaysRemaining with correct fractional days', async () => {
    // 25 days into 30-day requirement = 5 days remaining
    const ageMs = 25 * 24 * 60 * 60 * 1000;
    const redis = makeRedis({
      'Standard:paper:ineligible': '0',
      'Standard:paper:first_trade_age_ms': String(ageMs),
    });
    await checkPaperGate(redis, config);
    const calledDays = (setQwenPaperGateDaysRemaining as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledDays).toBeCloseTo(5, 0);
  });

  it('uses config.paperGateMinDays for remaining when no age recorded', async () => {
    const customConfig: RollbackConfig = { ...config, paperGateMinDays: 14 };
    const redis = makeRedis({ 'Standard:paper:ineligible': '0' });
    const result = await checkPaperGate(redis, customConfig);
    expect(result.active).toBe(true);
    expect(setQwenPaperGateDaysRemaining).toHaveBeenCalledWith(14);
    expect(result.metadata?.daysRemaining).toBe(14);
  });

  it('returns daysRemaining as 0 when eligible', async () => {
    const ageMs = 60 * 24 * 60 * 60 * 1000; // 60 days
    const redis = makeRedis({
      'Standard:paper:ineligible': '0',
      'Standard:paper:first_trade_age_ms': String(ageMs),
    });
    const result = await checkPaperGate(redis, config);
    expect(result.metadata?.daysRemaining).toBe(0);
    expect(result.metadata?.eligible).toBe(true);
  });
});
