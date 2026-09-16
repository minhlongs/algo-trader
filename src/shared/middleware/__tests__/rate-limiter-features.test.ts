/**
 * Rate Limiter Tests — Advanced Features & Cleanup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request } from 'express';
import {
  createRateLimiter,
  _clearStoreForTesting,
  _stopCleanupForTesting,
  _getStoreSizeForTesting,
} from '../rate-limiter';
import { makeReq, makeRes } from './rate-limiter.fixtures';

describe('createRateLimiter — Advanced Features & Cleanup', () => {
  beforeEach(() => {
    _clearStoreForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _stopCleanupForTesting();
    _clearStoreForTesting();
    vi.useRealTimers();
  });

  it('custom keyGenerator works correctly', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      keyGenerator: (req) => `user:${req.headers['x-api-key'] ?? 'anon'}`,
    });

    const req1 = makeReq({ headers: { 'x-api-key': 'key-a' } });
    const req2 = makeReq({ headers: { 'x-api-key': 'key-b' } });
    const res = makeRes();
    const next = vi.fn();

    limiter(req1, res, next);
    limiter(req1, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    const res2 = makeRes();
    limiter(req2, res2, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(res2.statusCode).toBe(0);
  });

  it('different clients have separate limits', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const next = vi.fn();

    const req1 = makeReq({ ip: '10.0.0.1' });
    const req2 = makeReq({ ip: '10.0.0.2' });

    const res1 = makeRes();
    limiter(req1, res1, next);
    limiter(req1, res1, next);

    const blocked1 = makeRes();
    limiter(req1, blocked1, next);
    expect(blocked1.statusCode).toBe(429);

    const res2 = makeRes();
    limiter(req2, res2, next);
    expect(res2.statusCode).toBe(0);
  });

  it('custom error message is returned', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      message: 'Rate limit exceeded. Please slow down.',
    });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    limiter(req, res, next);
    const blockedRes = makeRes();
    limiter(req, blockedRes, next);

    expect(blockedRes.body.error).toBe('Rate limit exceeded. Please slow down.');
  });

  it('skip function bypasses rate limiting', () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      skip: (req) => (req as unknown as Record<string, string>).headers?.['x-skip'] === 'true',
    });
    const next = vi.fn();

    const skipReq = makeReq({ headers: { 'x-skip': 'true' } });
    const skipRes = makeRes();

    for (let i = 0; i < 10; i++) {
      limiter(skipReq, skipRes, next);
    }
    expect(next).toHaveBeenCalledTimes(10);
    expect(skipRes.statusCode).toBe(0);
  });

  it('cleanup removes expired entries from store', () => {
    const limiter = createRateLimiter({ windowMs: 500, max: 5 });
    const next = vi.fn();
    const res = makeRes();

    limiter(makeReq({ ip: '1.1.1.1' }), res, next);
    limiter(makeReq({ ip: '2.2.2.2' }), res, next);
    expect(_getStoreSizeForTesting()).toBe(2);

    // Advance past window + two cleanup cycles: first fires at 500ms but
    // entries are exactly windowMs old so strict '>' keeps them;
    // second cycle at 1000ms clears them
    vi.advanceTimersByTime(1100);

    expect(_getStoreSizeForTesting()).toBe(0);
  });

  it('key generator falls back to socket.remoteAddress when ip is missing', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const next = vi.fn();

    const req = {
      ip: undefined,
      headers: {},
      socket: { remoteAddress: '192.168.1.100' },
    } as unknown as Request;

    const res1 = makeRes();
    limiter(req, res1, next);
    limiter(req, res1, next);

    const blocked = makeRes();
    limiter(req, blocked, next);
    expect(blocked.statusCode).toBe(429);
  });
});
