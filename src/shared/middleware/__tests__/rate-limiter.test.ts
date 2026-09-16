/**
 * Rate Limiter Tests — Core Limits & Headers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createRateLimiter,
  _clearStoreForTesting,
  _stopCleanupForTesting,
} from '../rate-limiter';
import { makeReq, makeRes } from './rate-limiter.fixtures';

describe('createRateLimiter — Core Limits & Headers', () => {
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

    for (let i = 0; i < 5; i++) {
      limiter(req, res, next);
    }

    expect(next).toHaveBeenCalledTimes(5);
    expect(res.statusCode).toBe(0);
  });

  it('blocks requests over the limit with 429', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

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

  it('window resets after expiry', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const req = makeReq();
    const next = vi.fn();

    const res1 = makeRes();
    limiter(req, res1, next);
    limiter(req, res1, next);

    const blockedRes = makeRes();
    limiter(req, blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);

    vi.advanceTimersByTime(61_000);

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

    limiter(req, res, next);
    const blockedRes = makeRes();
    limiter(req, blockedRes, next);

    expect(blockedRes.headers['Retry-After']).toBeDefined();
    expect(typeof blockedRes.headers['Retry-After']).toBe('number');
  });

  it('defaults to 100 requests per 60s window', () => {
    const limiter = createRateLimiter();
    const req = makeReq();
    const next = vi.fn();

    for (let i = 0; i < 100; i++) {
      const res = makeRes();
      limiter(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(100);

    const blockedRes = makeRes();
    limiter(req, blockedRes, next);
    expect(blockedRes.statusCode).toBe(429);
  });
});
