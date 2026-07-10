/**
 * Unit tests for signal-tier-resolver shared helper.
 *
 * Verifies resolveSubscriberId and requireSignalTier behavior
 * before extracting from inline copies in route files.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { resolveSubscriberId, requireSignalTier, __setGate } from '@platform/middleware/signal-tier-resolver';
import { LicenseTier, LicenseStatus } from '@shared/types/license';
import type { License } from '@shared/types/license';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockReq(authHeader?: string): Partial<Request> {
  return {
    headers: {
      authorization: authHeader ?? '',
    },
  } as Partial<Request>;
}

function makeMockRes(): Partial<Response> {
  const self = {} as Partial<Response>;
  self.status = vi.fn(function statusFn(code: number) { (self as unknown as { _status: number })._status = code; return self; });
  self.json = vi.fn(function jsonFn(body: unknown) { (self as unknown as { _body: unknown })._body = body; });
  (self as unknown as { _status: number })._status = 0;
  (self as unknown as { _body: unknown })._body = undefined;
  return self;
}

function makeMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function makeGate(response: License | null): { validateApiKey: (key: string) => License | null } {
  return { validateApiKey: vi.fn(() => response) };
}

function makeLicense(overrides: Partial<License> = {}): License {
  return {
    id: 'lic_default',
    name: 'Test License',
    key: 'RAAS-RPP-TEST-KEY-1234',
    tier: LicenseTier.PRO,
    status: LicenseStatus.ACTIVE,
    createdAt: new Date().toISOString(),
    usageCount: 0,
    tenantId: 'tenant-test-1',
    ...overrides,
  };
}

function assertSubscriber(req: Request): { subscriberId: string; tier: string } {
  return req.subscriber as { subscriberId: string; tier: string };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveSubscriberId', () => {
  afterEach(() => {
    __setGate(null);
  });

  // --- No auth header ---
  it('returns null when Authorization header is missing', () => {
    __setGate(makeGate(makeLicense()));
    const req = makeMockReq() as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
  });

  it('returns null when Authorization header is empty', () => {
    __setGate(makeGate(makeLicense()));
    const req = makeMockReq('') as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
  });

  // --- Bearer token ---
  it('returns null when token is not Bearer format', () => {
    __setGate(makeGate(makeLicense()));
    const req = makeMockReq('Basic YWRtaW46cGFzcw==') as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
  });

  // --- Valid license -> tier mapping ---
  it('maps ENTERPRISE license to ENTERPRISE tier', () => {
    const license = makeLicense({ tier: LicenseTier.ENTERPRISE, userId: 'user_enterprise_1' });
    const gate = makeGate(license);
    __setGate(gate);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const result = resolveSubscriberId(req);
    expect(result).toEqual({ subscriberId: 'user_enterprise_1', tier: 'ENTERPRISE' });
    expect(gate.validateApiKey).toHaveBeenCalledWith(license.key);
  });

  it('maps PRO license to PRO tier', () => {
    const license = makeLicense({ tier: LicenseTier.PRO, userId: 'user_pro_1' });
    const gate = makeGate(license);
    __setGate(gate);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const result = resolveSubscriberId(req);
    expect(result).toEqual({ subscriberId: 'user_pro_1', tier: 'PRO' });
  });

  it('maps FREE license to FREE tier', () => {
    const license = makeLicense({ tier: LicenseTier.FREE, userId: 'user_free_1' });
    const gate = makeGate(license);
    __setGate(gate);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const result = resolveSubscriberId(req);
    expect(result).toEqual({ subscriberId: 'user_free_1', tier: 'FREE' });
  });

  // --- Fallback: MASTER license -> FREE (signals tier, not platform tier) ---
  it('defaults MASTER license to FREE tier (signals tier limits)', () => {
    const license = makeLicense({ tier: LicenseTier.MASTER, userId: 'user_master_1' });
    const gate = makeGate(license);
    __setGate(gate);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const result = resolveSubscriberId(req);
    expect(result).toEqual({ subscriberId: 'user_master_1', tier: 'FREE' });
  });

  // --- Invalid / null license ---
  it('returns null when RaasGate rejects API key', () => {
    __setGate(makeGate(null));
    const req = makeMockReq('Bearer invalid-key') as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
  });

  // --- subscriberId fallback ---
  it('uses license.id when userId is absent', () => {
    const license = makeLicense({ userId: undefined, id: 'lic_direct_id' });
    const gate = makeGate(license);
    __setGate(gate);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const result = resolveSubscriberId(req);
    expect(result?.subscriberId).toBe('lic_direct_id');
  });
});

describe('requireSignalTier', () => {
  afterEach(() => {
    __setGate(null);
  });

  it('attaches subscriber to req and calls next() when tier sufficient', async () => {
    const license = makeLicense({ tier: LicenseTier.PRO });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('PRO');
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(assertSubscriber(req)).toEqual({ subscriberId: 'lic_default', tier: 'PRO' });
  });

  it('returns 403 when no API key provided', async () => {
    __setGate(makeGate(makeLicense()));
    const middleware = requireSignalTier('PRO');
    const req = makeMockReq() as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when api key is invalid', async () => {
    __setGate(makeGate(null));
    const middleware = requireSignalTier('PRO');
    const req = makeMockReq('Bearer bad-key') as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when tier is below PRO (FREE user)', async () => {
    const license = makeLicense({ tier: LicenseTier.FREE, userId: 'user_free' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('PRO');
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
