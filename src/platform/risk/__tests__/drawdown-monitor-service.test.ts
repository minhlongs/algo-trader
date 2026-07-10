/**
 * Drawdown Monitor Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawdownMonitorService } from '../drawdown-monitor-service';

describe('DrawdownMonitorService', () => {
  let mockRedis: Record<string, (...args: unknown[]) => unknown>;

  function makeRedis(overrides: Record<string, (...args: unknown[]) => unknown> = {}): Record<string, (...args: unknown[]) => unknown> {
    const state: Record<string, string | number> = {
      state: 'ACTIVE', reason: '', triggeredAt: '',
      currentValue: '100', peakValue: '100', consecutiveLosses: '0',
    };
    const dailyPnls: Record<string, string> = {};
    const histories: string[] = [];
    const alertsList: string[] = [];

    function ok(): Promise<string> { return Promise.resolve('OK'); }

    // hgetall reads from state (used by getState, canTrade, etc.)
    function hgetall(key: string): Promise<Record<string, string | number>> {
      if (key === 'drawdown:state') {
        return Promise.resolve({ ...state, dailyPnl: '0', accountValue: '0' } as Record<string, string | number>);
      }
      if (key === 'drawdown:halt') {
        return Promise.resolve({ state: state.state, reason: state.reason, triggeredAt: state.triggeredAt } as Record<string, string | number>);
      }
      return Promise.resolve({});
    }

    // get: key-aware — overrides can replace specific keys, others fall through
    function get(key: string): Promise<string | null> {
      if (overrides.get) return overrides.get(key);
      if (key.startsWith('risk:alert:throttle:')) return Promise.resolve(null);
      return Promise.resolve(state[key] ?? null);
    }

    // set: overridable for call inspection, otherwise updates state
    function set(key: string, val: string): Promise<string> {
      if (overrides.set) return overrides.set(key, val);
      state[key] = val;
      return ok();
    }

    function hset(key: string, payload: unknown): Promise<string> {
      if (overrides.hset) return overrides.hset(key, payload);
      if (key === 'drawdown:state' && typeof payload === 'object') {
        for (const [k, v] of Object.entries(payload as Record<string, string | number>)) state[k] = String(v);
      }
      if (key === 'drawdown:halt' && typeof payload === 'object') {
        for (const [k, v] of Object.entries(payload as Record<string, string | number>)) state[k] = String(v);
      }
      return ok();
    }

    function hmset(key: string, payload: unknown): Promise<string> {
      if (typeof payload === 'object') {
        for (const [k, v] of Object.entries(payload as Record<string, string | number>)) state[k] = String(v);
      }
      return ok();
    }

    function hmget(_key: string, ...fields: string[]): Promise<(string | null)[]> {
      return Promise.resolve(fields.map(f => state[f] ?? null));
    }

    function lpush(key: string, val: string): Promise<number> {
      if (key.startsWith('risk:alerts:') || key === 'drawdown:alerts') alertsList.unshift(val);
      else histories.unshift(val);
      return Promise.resolve(alertsList.length + histories.length);
    }

    function ltrim(key: string): Promise<string> {
      const arr = key.startsWith('risk:alerts:') || key === 'drawdown:alerts' ? alertsList : histories;
      if (arr.length > 200) arr.length = 200;
      return ok();
    }

    function lrange(key: string, _s: number, _e: number): Promise<string[]> {
      if (key.startsWith('risk:alerts:') || key === 'drawdown:alerts') return Promise.resolve(alertsList.slice(0, 200));
      return Promise.resolve(histories.slice(0, 50));
    }

    function setex(_key: string, _ttl: number, val: string): Promise<string> { return ok(); }
    function del(_key: string): Promise<number> { return Promise.resolve(1); }
    function expire(_key: string, _ttl: number): Promise<number> { return Promise.resolve(1); }

    // Wrap each base fn with a vi.fn() spy so mock.calls/HaveBeenCalled work.
    function spied(fn: (...a: unknown[]) => unknown): (...a: unknown[]) => unknown {
      const spy = vi.fn(fn as (...a: unknown[]) => unknown);
      return spy;
    }

    const base: Record<string, (...args: unknown[]) => unknown> = {
      get, set, setex, hgetall, hset, hmset, hmget, lpush, ltrim, lrange, del, expire,
    };
    const spyBase: Record<string, unknown> = {};
    for (const [k, fn] of Object.entries(base)) {
      spyBase[k] = spied(fn);
    }
    // overrides replace the spy; can also add extra keys
    const result: Record<string, unknown> = {};
    for (const [k] of Object.entries(spyBase)) { result[k] = overrides[k] ?? spyBase[k]; }
    for (const [k, v] of Object.entries(overrides)) { if (!(k in result)) result[k] = v; }
    return result as unknown as DrawdownMonitorService['redis'];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = makeRedis();
  });

  // ── recordTrade ──────────────────────────────────────────────────────

  it('records trade and returns metrics', async () => {
    const service = new DrawdownMonitorService(makeRedis());
    const metrics = await service.recordTrade(5);

    expect(metrics.currentValue).toBe(105);
    expect(metrics.peakValue).toBe(105);
    expect(metrics.consecutiveLosses).toBe(0);
  });

  it('tracks consecutive losses', async () => {
    const service = new DrawdownMonitorService(makeRedis());
    await service.recordTrade(-10);
    await service.recordTrade(-5);

    // After two losses, consecutiveLosses should be 2
    const metrics = await service.getStatus('user-1');
    expect(metrics.data.consecutiveLosses).toBe(2);
  });

  it('resets consecutive losses on win', async () => {
    const service = new DrawdownMonitorService(makeRedis());
    await service.recordTrade(-10);
    await service.recordTrade(15);

    // After a win, consecutiveLosses should be 0
    const metrics = await service.getStatus('user-1');
    expect(metrics.data.consecutiveLosses).toBe(0);
  });

  // ── getStatus ────────────────────────────────────────────────────────

  it('getStatus returns metrics with history and alerts', async () => {
    const service = new DrawdownMonitorService(makeRedis());
    const status = await service.getStatus('user-1');

    expect(status.success).toBe(true);
    expect(status.data.history).toBeDefined();
    expect(status.data.alerts).toBeDefined();
  });

  // ── canTrade ────────────────────────────────────────────────────────

  it('canTrade returns false when halted', async () => {
    const service = new DrawdownMonitorService(makeRedis({
      hgetall: vi.fn().mockResolvedValue({ state: 'HALTED', reason: 'test', triggeredAt: String(Date.now()) }),
    }));
    expect(await service.canTrade()).toBe(false);
  });

  it('canTrade returns true when active', async () => {
    const service = new DrawdownMonitorService(makeRedis());
    expect(await service.canTrade()).toBe(true);
  });

  // ── checkAndAlert ───────────────────────────────────────────────────

  it('checkAndAlert generates alerts when threshold breached', async () => {
    const redis = makeRedis();
    mockRedis = redis;
    const today = new Date().toISOString().split('T')[0];
    await redis.set('drawdown:daily_start', '100');
    await redis.set(`drawdown:daily:${today}`, '-6');

    // get() returns null for throttle key (no prior alert), then daily_start=100 / daily=-6 → 6% drawdown
    const service = new DrawdownMonitorService(redis);
    const result = await service.checkAndAlert('user-1', { dailyThreshold: 0.05 });

    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.throttled).toBe(false);
  });

  it('throttles alerts to 1 per 15 minutes', async () => {
    const redis = makeRedis({
      // Throttle key returns timestamp from 60s ago → within 15min window
      get: (key: string) => key.startsWith('risk:alert:throttle:')
        ? Promise.resolve(String(Date.now() - 60_000))
        : Promise.resolve(null),
    });
    const service = new DrawdownMonitorService(redis);
    const result = await service.checkAndAlert('user-throttled', {});
    expect(result.throttled).toBe(true);
    expect(result.alerts).toHaveLength(0);
  });

  // ── resume ──────────────────────────────────────────────────────────

  it('resumes from halted state', async () => {
    const mockHset = vi.fn().mockResolvedValue('OK');
    const mockGet = vi.fn()
      .mockImplementation((key: string) => key === 'drawdown:daily_start'
        ? Promise.resolve('100') : Promise.resolve(null));

    const redis = makeRedis({
      hgetall: vi.fn().mockResolvedValue({ state: 'HALTED', reason: 'test', triggeredAt: String(Date.now()) }),
      hset: mockHset,
      get: mockGet,
    });
    const service = new DrawdownMonitorService(redis);
    await service.resume();

    expect(mockHset).toHaveBeenCalledWith(
      'drawdown:halt',
      expect.objectContaining({ state: 'ACTIVE' }),
    );
  });

  // ── initializeDay ───────────────────────────────────────────────────

  it('initializes day tracking', async () => {
    const mockSet = vi.fn().mockResolvedValue('OK');
    const mockDel = vi.fn().mockResolvedValue(1);
    const service = new DrawdownMonitorService(makeRedis({ set: mockSet, del: mockDel }));
    await service.initializeDay();
    expect(mockSet).toHaveBeenCalled();
  });
});
