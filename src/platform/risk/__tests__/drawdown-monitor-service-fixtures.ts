/**
 * Drawdown Monitor Service Test Fixtures — Tranche 41
 * Shared mock Redis factory for drawdown monitor service tests.
 */
import { vi } from 'vitest';

type RedisFn = (...args: unknown[]) => unknown;

export function makeRedis(
  overrides: Record<string, RedisFn> = {},
): Record<string, RedisFn> {
  const state: Record<string, string | number> = {
    state: 'ACTIVE', reason: '', triggeredAt: '',
    currentValue: '100', peakValue: '100', consecutiveLosses: '0',
  };
  const histories: string[] = [];
  const alertsList: string[] = [];

  function ok(): Promise<string> { return Promise.resolve('OK'); }

  function hgetall(...args: unknown[]): Promise<Record<string, string | number>> {
    const key = args[0] as string;
    if (key === 'drawdown:state') return Promise.resolve({ ...state, dailyPnl: '0', accountValue: '0' });
    if (key === 'drawdown:halt') return Promise.resolve({ state: state.state, reason: state.reason, triggeredAt: state.triggeredAt });
    return Promise.resolve({});
  }

  function get(...args: unknown[]): Promise<string | null> {
    const key = args[0] as string;
    if (overrides.get) return Promise.resolve(overrides.get(key) as string | null);
    if (key.startsWith('risk:alert:throttle:')) return Promise.resolve(null);
    return Promise.resolve(state[key] !== undefined ? String(state[key]) : null);
  }

  function set(...args: unknown[]): Promise<string> {
    const [key, val] = args as [string, string];
    if (overrides.set) return Promise.resolve(overrides.set(key, val) as string);
    state[key] = val;
    return ok();
  }

  function hset(...args: unknown[]): Promise<string> {
    const [key, payload] = args as [string, unknown];
    if (overrides.hset) return Promise.resolve(overrides.hset(key, payload) as string);
    if ((key === 'drawdown:state' || key === 'drawdown:halt') && typeof payload === 'object' && payload !== null) {
      for (const [k, v] of Object.entries(payload as Record<string, string | number>)) state[k] = String(v);
    }
    return ok();
  }

  function hmset(...args: unknown[]): Promise<string> {
    const payload = args[1] as unknown;
    if (typeof payload === 'object' && payload !== null) {
      for (const [k, v] of Object.entries(payload as Record<string, string | number>)) state[k] = String(v);
    }
    return ok();
  }

  function hmget(...args: unknown[]): Promise<(string | null)[]> {
    const fields = args.slice(1) as string[];
    return Promise.resolve(fields.map((f) => (state[f] !== undefined ? String(state[f]) : null)));
  }

  function lpush(...args: unknown[]): Promise<number> {
    const [key, val] = args as [string, string];
    if (key.startsWith('risk:alerts:') || key === 'drawdown:alerts') alertsList.unshift(val);
    else histories.unshift(val);
    return Promise.resolve(alertsList.length + histories.length);
  }

  function ltrim(...args: unknown[]): Promise<string> {
    const key = args[0] as string;
    const arr = key.startsWith('risk:alerts:') || key === 'drawdown:alerts' ? alertsList : histories;
    if (arr.length > 200) arr.length = 200;
    return ok();
  }

  function lrange(...args: unknown[]): Promise<string[]> {
    const key = args[0] as string;
    if (key.startsWith('risk:alerts:') || key === 'drawdown:alerts') return Promise.resolve(alertsList.slice(0, 200));
    return Promise.resolve(histories.slice(0, 50));
  }

  function setex(): Promise<string> { return ok(); }
  function del(): Promise<number> { return Promise.resolve(1); }
  function expire(): Promise<number> { return Promise.resolve(1); }

  const base: Record<string, RedisFn> = {
    get, set, setex, hgetall, hset, hmset, hmget, lpush, ltrim, lrange, del, expire,
  };
  const spyBase: Record<string, RedisFn> = {};
  for (const [k, fn] of Object.entries(base)) spyBase[k] = vi.fn(fn) as RedisFn;
  const result: Record<string, RedisFn> = {};
  for (const [k] of Object.entries(spyBase)) result[k] = overrides[k] ?? spyBase[k];
  for (const [k, v] of Object.entries(overrides)) { if (!(k in result)) result[k] = v; }
  return result;
}
