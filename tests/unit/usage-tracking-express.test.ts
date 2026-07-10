/**
 * Unit tests for usage-tracking-express middleware.
 *
 * Verifies that recordCall() fires correctly for authenticated
 * vs unauthenticated requests, and never throws on errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// vi.hoisted runs before vi.mock is hoisted, so mockRecordCall is available
// when the factory executes (avoiding "Cannot access before initialization").
const mockRecordCall = vi.hoisted(() => vi.fn());
vi.mock('@platform/signals-api/usage-metering-service', () => ({
  usageMetering: {
    recordCall: mockRecordCall,
  },
}));

// Import AFTER mocks so the singleton picks up the mock
import { usageTrackingMiddleware } from '@platform/middleware/usage-tracking-express';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------
function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    ...overrides,
  } as Partial<Request>;
}

function makeRes(): Partial<Response> & {
  _finishListeners: Map<string, () => void>;
  status: ReturnType<typeof vi.fn>;
} {
  const finishListeners = new Map<string, () => void>();
  const self = {
    _finishListeners: finishListeners,
    status: vi.fn(function (code: number) { return self; }),
    json: vi.fn(function () { return self; }),
    send: vi.fn(function () { return self; }),
    end: vi.fn(function () {
      // Simulate response finish: run all finish listeners
      finishListeners.forEach((fn) => fn());
      return self;
    }),
  } as unknown as Partial<Response> & {
    _finishListeners: Map<string, () => void>;
    status: ReturnType<typeof vi.fn>;
  };
  // Patch on() so we can capture finish listeners
  (self as unknown as Record<string, unknown>).on = vi.fn(function (
    event: string,
    fn: () => void,
  ) {
    if (event === 'finish') {
      finishListeners.set(fn.name || 'anon', fn);
    }
    return self;
  });
  return self;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('usageTrackingMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('calls next() immediately without waiting for response', () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('registers finish listener on the response', () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req as Request, res as Response, next);
    // on() should have been called with 'finish'
    const onCalls = (res as unknown as { on: ReturnType<typeof vi.fn> }).on.mock.calls;
    const finishCalls = onCalls.filter((c: unknown[]) => c[0] === 'finish');
    expect(finishCalls.length).toBe(1);
  });

  it('records a call when req.subscriber is present', () => {
    const req = makeReq({
      subscriber: { subscriberId: 'user_abc123', tier: 'PRO' },
    }) as Request;
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req, res as Response, next);

    // Simulate response ending — this triggers finish listeners
    (res as unknown as { end: ReturnType<typeof vi.fn> }).end();

    expect(mockRecordCall).toHaveBeenCalledTimes(1);
    expect(mockRecordCall).toHaveBeenCalledWith('user_abc123', 'PRO');
  });

  it('records FREE tier call correctly', () => {
    const req = makeReq({
      subscriber: { subscriberId: 'user_free', tier: 'FREE' },
    }) as Request;
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req, res as Response, next);
    (res as unknown as { end: ReturnType<typeof vi.fn> }).end();
    expect(mockRecordCall).toHaveBeenCalledWith('user_free', 'FREE');
  });

  it('records ENTERPRISE tier call correctly', () => {
    const req = makeReq({
      subscriber: { subscriberId: 'user_ent', tier: 'ENTERPRISE' },
    }) as Request;
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req, res as Response, next);
    (res as unknown as { end: ReturnType<typeof vi.fn> }).end();
    expect(mockRecordCall).toHaveBeenCalledWith('user_ent', 'ENTERPRISE');
  });

  it('does not call recordCall when req.subscriber is undefined', () => {
    const req = makeReq() as Request;
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req, res as Response, next);
    (res as unknown as { end: ReturnType<typeof vi.fn> }).end();
    expect(mockRecordCall).not.toHaveBeenCalled();
  });

  it('does not call recordCall when subscriberId is missing', () => {
    const req = makeReq({
      subscriber: { tier: 'PRO' } as { subscriberId: string; tier: string },
    }) as unknown as Request;
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req, res as Response, next);
    (res as unknown as { end: ReturnType<typeof vi.fn> }).end();
    expect(mockRecordCall).not.toHaveBeenCalled();
  });

  it('does not call recordCall when tier is missing', () => {
    const req = makeReq({
      subscriber: { subscriberId: 'user_abc' } as { subscriberId: string; tier: string },
    }) as unknown as Request;
    const res = makeRes();
    const next = makeNext();
    usageTrackingMiddleware(req, res as Response, next);
    (res as unknown as { end: ReturnType<typeof vi.fn> }).end();
    expect(mockRecordCall).not.toHaveBeenCalled();
  });

  it('swallows errors when recordCall throws (non-fatal)', () => {
    mockRecordCall.mockRejectedValueOnce(new Error('DB connection lost'));
    const req = makeReq({
      subscriber: { subscriberId: 'user_abc', tier: 'PRO' },
    }) as Request;
    const res = makeRes();
    const next = makeNext();

    // Should not throw even though recordCall fails
    expect(() => {
      usageTrackingMiddleware(req, res as Response, next);
      (res as unknown as { end: ReturnType<typeof vi.fn> }).end();
    }).not.toThrow();

    expect(next).toHaveBeenCalledTimes(1);
  });
});
