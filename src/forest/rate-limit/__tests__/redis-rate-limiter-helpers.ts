/**
 * Shared test helpers for RedisRateLimiter test suites.
 *
 * Provides makeLimiter, withTierOverride, withRedis so that parent
 * (redis-rate-limiter.test.ts) and window sub-suite
 * (redis-rate-limiter-window.test.ts) can stay under 200 LOC.
 */
import { vi } from 'vitest';
// ioredis-mock's types live in @types/ioredis-mock, but tsconfig.json
// restricts `types: ["node","@cloudflare/workers-types"]`, so tsc can't
// see them. Declare the minimal surface the tests use here instead of
// widening tsconfig types for the whole project.
declare class IoredisMock {
  constructor();
  flushall(): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
  zrange(
    key: string,
    start: number,
    stop: number,
    opt?: string,
  ): Promise<string[]>;
  exists(key: string): Promise<number>;
  del(key: string): Promise<number>;
}
// require() the JS implementation to avoid ESM default-import mismatch
// (ioredis-mock ships CJS only). Suppress is unnecessary — the rule is
// `warn` in eslint.config.js, not `error`.
const IoredisMockImpl = require('ioredis-mock') as new () => IoredisMock;
import {
  RedisRateLimiter,
  TIER_RATE_LIMITS,
  type TierRateLimits,
} from '../redis-rate-limiter';

export function makeLimiter(
  windowSeconds = 60,
  keyTtlSeconds?: number,
): RedisRateLimiter {
  return new RedisRateLimiter({ windowSeconds, keyTtlSeconds });
}

export function withTierOverride(
  tierName: string,
  limits: TierRateLimits,
  fn: () => void | Promise<void>,
): void {
  const key = tierName.toUpperCase() as keyof typeof TIER_RATE_LIMITS;
  const saved = TIER_RATE_LIMITS[key];
  TIER_RATE_LIMITS[key] = limits;
  try { void fn(); } finally { TIER_RATE_LIMITS[key] = saved; }
}

export async function withRedis<T>(
  fn: (mock: IoredisMock) => Promise<T>,
): Promise<T> {
  const mock: IoredisMock = new IoredisMockImpl();
  await mock.flushall();

  const mod = await import('@redis');
  const spy = vi.spyOn(mod, 'getRedisClient').mockReturnValue(
    mock as unknown as ReturnType<typeof mod.getRedisClient>,
  );

  try {
    return await fn(mock);
  } finally {
    spy.mockRestore();
  }
}
