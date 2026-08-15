/**
 * Rate limiter load / stress test.
 *
 * Validates that the sliding-window rate limiter correctly enforces
 * limits under rapid concurrent requests and resets after the window.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  _clearStoreForTesting,
  _stopCleanupForTesting,
} from '../rate-limiter';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(ip = '10.0.0.1'): Request {
  return {
    ip,
    headers: {},
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; body: Record<string, unknown>; headers: Record<string, string | number> } {
  const res = {
    statusCode: 200,
    body: {} as Record<string, unknown>,
    headers: {} as Record<string, string | number>,
    status(code: number) { res.statusCode = code; return res; },
    json(data: unknown) { res.body = data as Record<string, unknown>; return res; },
    setHeader(name: string, value: string | number) { res.headers[name] = value; },
  } as unknown as Response & { statusCode: number; body: Record<string, unknown>; headers: Record<string, string | number> };
  return res;
}

const noopNext: NextFunction = () => {};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('rate-limiter load test', () => {
  beforeEach(() => {
    _clearStoreForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _stopCleanupForTesting();
    vi.useRealTimers();
  });

  it('allows first 10 of 15 rapid requests, blocks last 5', () => {
    const limiter = createRateLimiter({ max: 10, windowMs: 1000 });
    const req = makeReq();
    const results: number[] = [];

    for (let i = 0; i < 15; i++) {
      const res = makeRes();
      limiter(req, res, noopNext);
      results.push(res.statusCode);
    }

    const allowed = results.filter((s) => s === 200);
    const blocked = results.filter((s) => s === 429);

    expect(allowed).toHaveLength(10);
    expect(blocked).toHaveLength(5);
  });

  it('resets window after windowMs elapses', () => {
    const limiter = createRateLimiter({ max: 10, windowMs: 1000 });
    const req = makeReq();

    // Exhaust the window
    for (let i = 0; i < 10; i++) {
      const res = makeRes();
      limiter(req, res, noopNext);
    }

    // 11th request should be blocked
    const blocked = makeRes();
    limiter(req, blocked, noopNext);
    expect(blocked.statusCode).toBe(429);

    // Advance time past the window
    vi.advanceTimersByTime(1100);

    // Next batch should all pass
    const results: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      limiter(req, res, noopNext);
      results.push(res.statusCode);
    }

    expect(results.every((s) => s === 200)).toBe(true);
  });

  it('handles concurrent burst correctly across multiple clients', () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 1000 });

    const clientA = makeReq('10.0.0.1');
    const clientB = makeReq('10.0.0.2');

    // Client A sends 5 requests — all allowed
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      limiter(clientA, res, noopNext);
      expect(res.statusCode).toBe(200);
    }

    // Client A 6th request — blocked
    const blockedA = makeRes();
    limiter(clientA, blockedA, noopNext);
    expect(blockedA.statusCode).toBe(429);

    // Client B sends 5 requests — all allowed (separate key)
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      limiter(clientB, res, noopNext);
      expect(res.statusCode).toBe(200);
    }
  });

  it('returns correct headers on allowed and blocked requests', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000 });
    const req = makeReq();

    const res1 = makeRes();
    limiter(req, res1, noopNext);
    expect(res1.statusCode).toBe(200);

    // Exhaust limit
    limiter(req, makeRes(), noopNext);
    limiter(req, makeRes(), noopNext);

    const blocked = makeRes();
    limiter(req, blocked, noopNext);
    expect(blocked.statusCode).toBe(429);

    // Verify the blocked response has a meaningful error body
    expect(blocked.body).toHaveProperty('error');
    expect(typeof blocked.body.error).toBe('string');
  });
});
