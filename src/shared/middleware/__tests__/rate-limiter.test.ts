/**
 * Tests for in-memory sliding window rate limiter.
 *
 * Covers: allowed/blocked requests, headers, custom keyGenerator,
 * window reset, memory cleanup, and separate client limits.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  _clearStoreForTesting,
  _stopCleanupForTesting,
  _getStoreSizeForTesting,
} from '../rate-limiter';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<{ ip: string; headers: Record<string, string> }> = {}): Request {
  return {
    ip: overrides.ip ?? '127.0.0.1',
    headers: overrides.headers ?? {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; body: Record<string, unknown>; headers: Record<string, string | number> } {
  const res = {
    statusCode: 0,
    body: {} as Record<string, unknown>,
    headers: {} as Record<string, string | number>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      res.body = data;
      return res;
    },
    setHeader(name: string, value: string | number) {
      res.headers[name] = value;
    },
  } as unknown as Response & { statusCode: number; body: Record<string, unknown>; headers: Record<string, string | number> };
  return res;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createRateLimiter', () => {
  beforeEach(() => {
    _clearStoreForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _stopCleanupForTesting();
    _clearStoreForTesting();
    vi.useRealTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Send 5 requests (at limit, not over)
    for (let i = 0; i < 5; i++) {
      limiter(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(5);
    expect(res.statusCode).toBe(0); // never hit 429
  });

  it('blocks requests over the limit with 429', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    // Send 4 requests (1 over the limit)
    for (let i = 0; i < 4; i++) {
      limiter(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('Too many requests');
    expect(typeof res.body.retryAfter).toBe('number');
  });

  it('sets correct X-RateLimit headers', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    limiter(req, res, next);

    expect(res.headers['X-RateLimit-Limit']).toBe(10);
    expect(res.headers['X-RateLimit-Remaining']).toBe(9);
    expect(typeof res.headers['X-RateLimit-Reset']).toBe('number');
  });

  it('decrements remaining correctly across requests', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = makeReq();
    const next = vi.fn();

    const res1 = makeRes();
    limiter(req, res1, next);
    expect(res1.headers['X-RateLimit-Remaining']).toBe(2);

    const res2 = makeRes();
    limiter(req, res2, next);
    expect(res2.headers['X-RateLimit-Remaining']).toBe(1);

    const res3 = makeRes();
    limiter(req, res3, next);
    expect(res3.headers['X-RateLimit-Remaining']).toBe(0);
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

    // key-a uses 2 of 2
    limiter(req1, res, next);
    limiter(req1, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // key-b should still be allowed (separate limit)
    const res2 = makeRes();
    limiter(req2, res2, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(res2.statusCode).toBe(0);
  });

  it('window resets after expiry', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const req = makeReq();
    const next = vi.fn();

    // Use up the limit
    const res1 = makeRes();
    limiter(req, res1, next);
    limiter(req, res1, next);

    // Next request should be blocked
    const blockedRes = makeRes();
    limiter(req, blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);

    // Should allow requests again
    const newWindowRes = makeRes();
    limiter(req, newWindowRes, next);
    expect(newWindowRes.statusCode).toBe(0);
    expect(newWindowRes.headers['X-RateLimit-Remaining']).toBe(1);
  });

  it('sets Retry-After header when blocked', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    limiter(req, res, next); // allowed
    const blockedRes = makeRes();
    limiter(req, blockedRes, next); // blocked

    expect(blockedRes.headers['Retry-After']).toBeDefined();
    expect(typeof blockedRes.headers['Retry-After']).toBe('number');
  });

  it('different clients have separate limits', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const next = vi.fn();

    const req1 = makeReq({ ip: '10.0.0.1' });
    const req2 = makeReq({ ip: '10.0.0.2' });

    // Client 1 uses up limit
    const res1 = makeRes();
    limiter(req1, res1, next);
    limiter(req1, res1, next);

    // Client 1 blocked
    const blocked1 = makeRes();
    limiter(req1, blocked1, next);
    expect(blocked1.statusCode).toBe(429);

    // Client 2 still allowed
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

    limiter(req, res, next); // allowed
    const blockedRes = makeRes();
    limiter(req, blockedRes, next); // blocked

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
    const res = makeRes();
    const skipRes = makeRes();

    // Send many requests — all should pass because skip returns true
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

    // Create entries for two different IPs
    limiter(makeReq({ ip: '1.1.1.1' }), res, next);
    limiter(makeReq({ ip: '2.2.2.2' }), res, next);
    expect(_getStoreSizeForTesting()).toBe(2);

    // Advance past window + two cleanup cycles: first fires at 500ms but
    // entries are exactly windowMs old so strict '>' keeps them;
    // second cycle at 1000ms clears them
    vi.advanceTimersByTime(1100);

    // Cleanup should have removed expired entries
    expect(_getStoreSizeForTesting()).toBe(0);
  });

  it('defaults to 100 requests per 60s window', () => {
    const limiter = createRateLimiter();
    const req = makeReq();
    const next = vi.fn();

    // Send exactly 100 requests — all should pass
    for (let i = 0; i < 100; i++) {
      const res = makeRes();
      limiter(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(100);

    // 101st request should be blocked
    const blockedRes = makeRes();
    limiter(req, blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);
  });

  it('key generator falls back to socket.remoteAddress when ip is missing', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const next = vi.fn();

    // Request with no ip, only socket.remoteAddress
    const req = {
      ip: undefined,
      headers: {},
      socket: { remoteAddress: '192.168.1.100' },
    } as unknown as Request;

    const res1 = makeRes();
    limiter(req, res1, next);
    limiter(req, res1, next);

    // Third request should be blocked — proves same key was used
    const blocked = makeRes();
    limiter(req, blocked, next);
    expect(blocked.statusCode).toBe(429);
  });
});
