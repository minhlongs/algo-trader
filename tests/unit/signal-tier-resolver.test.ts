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

// Intercept the lazy-load require('../gate/raas-gate') inside getGate().
// Vitest's vi.mock does NOT intercept CommonJS require() calls from source
// files (only ESM imports/dynamic imports from the test file itself), so we
// override Module._load directly to intercept the require at the Node level.
// The source resolves '../gate/raas-gate' relative to src/platform/middleware,
// which points to src/platform/gate/raas-gate (does not exist — real file is
// in src/desk/gate). We return a fake singleton with a default export.
const _Module = require('module') as typeof import('module');
const _origLoad = _Module._load;
_Module._load = function patchedLoad(request: string, parent: { filename?: string }, ...args: unknown[]): unknown {
  if (request === '../gate/raas-gate' && parent.filename?.includes('signal-tier-resolver')) {
    return {
      default: {
        getInstance: () => ({
          validateApiKey: () => null,
        }),
      },
    };
  }
  return _origLoad.call(this, request, parent, ...args);
};

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

describe('getGate lazy-load', () => {
  afterEach(() => {
    __setGate(null);
  });

  it('lazy-loads gate via require when _gate is null', () => {
    // Exercises getGate() lines 27-33: the `if (!_gate)` TRUE path,
    // the `require('../gate/raas-gate')` call, and the
    // `mod.default ?? mod` + `exporter.getInstance?.() ?? null` resolution.
    __setGate(null);
    const req = makeMockReq('Bearer some-key') as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
  });

  it('resolves named export (no default) via mod ?? mod fallback', () => {
    // Exercises branch 1 path 1 (line 31): when the module has no `default`
    // export, the `mod.default ?? mod` expression falls back to `mod` itself.
    // We patch Module._load for this test to return a named-export module.
    const orig = _Module._load;
    _Module._load = function patchedLoad(request: string, parent: { filename?: string }, ...args: unknown[]): unknown {
      if (request === '../gate/raas-gate' && parent.filename?.includes('signal-tier-resolver')) {
        // No default export — only a named export with getInstance()
        return {
          getInstance: () => ({
            validateApiKey: () => null,
          }),
        };
      }
      return orig.call(this, request, parent, ...args);
    };
    __setGate(null);
    const req = makeMockReq('Bearer named-key') as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
    _Module._load = orig;
  });

  it('resolves null when exporter has no getInstance (optional chaining fallback)', () => {
    // Exercises branch 2 path 1 (line 32): when the exporter has no
    // getInstance method, `exporter.getInstance?.() ?? null` returns null.
    const orig = _Module._load;
    _Module._load = function patchedLoad(request: string, parent: { filename?: string }, ...args: unknown[]): unknown {
      if (request === '../gate/raas-gate' && parent.filename?.includes('signal-tier-resolver')) {
        // Exporter without getInstance
        return {
          default: {
            someOtherMethod: () => 'not getInstance',
          },
        };
      }
      return orig.call(this, request, parent, ...args);
    };
    __setGate(null);
    const req = makeMockReq('Bearer no-method-key') as Request;
    const result = resolveSubscriberId(req);
    expect(result).toBeNull();
    _Module._load = orig;
  });
});

describe('requireSignalTier unknown minTier', () => {
  afterEach(() => {
    __setGate(null);
  });

  it('returns 403 when minTier is unknown (TIER_RANK fallback to -1)', async () => {
    // Exercises branch 12 path 0: `TIER_RANK[minTier] ?? -1` where
    // TIER_RANK['UNKNOWN'] is undefined, so the fallback -1 is used.
    // Since -1 < any valid tier rank, the check passes and next() is called
    // for an ENTERPRISE user (rank 3 > -1).
    const license = makeLicense({ tier: LicenseTier.ENTERPRISE, userId: 'ent_unknown_tier' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('UNKNOWN' as TierKey);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    // ENTERPRISE rank 3 >= -1, so access granted
    expect(next).toHaveBeenCalledTimes(1);
    expect(assertSubscriber(req)).toEqual({ subscriberId: 'ent_unknown_tier', tier: 'ENTERPRISE' });
  });

  it('returns 403 when user tier is below minTier (FREE < PRO)', async () => {
    // Exercises branch 12 path 1: `TIER_RANK[identity.tier] ?? -1` where
    // the user's tier IS in TIER_RANK (FREE=0) but below minTier (PRO=2).
    // The comparison 0 < 2 is true, so 403 is returned.
    const license = makeLicense({ tier: LicenseTier.FREE, userId: 'user_free_below' });
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

  it('returns 403 when user rank is lower than minTier rank (FREE < ENTERPRISE)', async () => {
    // Exercises branch 12 path 1 (second location, `?? -1` on minTier):
    // when minTier is valid (ENTERPRISE, rank 3) and the user's rank is below
    // (FREE, rank 0), the `?? -1` fallback on minTier is NOT taken. The full
    // expression `(TIER_RANK[identity.tier] ?? -1) < (TIER_RANK[minTier] ?? -1)`
    // is evaluated with both sides having defined ranks.
    const license = makeLicense({ tier: LicenseTier.FREE, userId: 'user_free_rank_below' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('ENTERPRISE');
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 200 when both user tier and minTier are valid and user rank >= minTier rank (ENTERPRISE >= PRO)', async () => {
    // Exercises branch 12 path 1 (second location, `?? -1` on minTier):
    // when minTier is valid (PRO) and user tier is valid (ENTERPRISE, rank 3),
    // the expression's second operand uses TIER_RANK[minTier] without fallback.
    // ENTERPRISE rank 3 >= PRO rank 2 → access granted.
    const license = makeLicense({ tier: LicenseTier.ENTERPRISE, userId: 'user_ent_above_pro' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('PRO');
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(assertSubscriber(req)).toEqual({ subscriberId: 'user_ent_above_pro', tier: 'ENTERPRISE' });
  });

  it('returns 200 when both user tier and minTier are equal rank (PRO >= PRO)', async () => {
    // Exercises branch 12 path 1 (second location, `?? -1` on minTier):
    // when minTier is valid (PRO, rank 2) and user tier is valid (PRO, rank 2),
    // the expression's second operand uses TIER_RANK[minTier] without fallback.
    // PRO rank 2 >= PRO rank 2 → access granted.
    const license = makeLicense({ tier: LicenseTier.PRO, userId: 'user_pro_equal_pro' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('PRO');
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(assertSubscriber(req)).toEqual({ subscriberId: 'user_pro_equal_pro', tier: 'PRO' });
  });

  it('returns 200 when user tier is FREE and minTier is FREE (equal rank)', async () => {
    // Exercises branch 12 path 1 (second location, `?? -1` on minTier):
    // when minTier is valid (FREE, rank 0) and user tier is valid (FREE, rank 0),
    // the expression's second operand uses TIER_RANK[minTier] without fallback.
    // FREE rank 0 >= FREE rank 0 → access granted.
    const license = makeLicense({ tier: LicenseTier.FREE, userId: 'user_free_equal_free' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('FREE' as TierKey);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(assertSubscriber(req)).toEqual({ subscriberId: 'user_free_equal_free', tier: 'FREE' });
  });

  it('returns 200 when user tier is PRO and minTier is FREE (rank 2 >= 0)', async () => {
    // Exercises branch 12 path 1 (second location, `?? -1` on minTier):
    // when minTier is valid (FREE, rank 0) and user tier is valid (PRO, rank 2),
    // the expression's second operand uses TIER_RANK[minTier] without fallback.
    // PRO rank 2 >= FREE rank 0 → access granted.
    const license = makeLicense({ tier: LicenseTier.PRO, userId: 'user_pro_above_free' });
    const gate = makeGate(license);
    __setGate(gate);
    const middleware = requireSignalTier('FREE' as TierKey);
    const req = makeMockReq(`Bearer ${license.key}`) as Request;
    const res = makeMockRes() as Partial<Response>;
    const next = makeMockNext();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(assertSubscriber(req)).toEqual({ subscriberId: 'user_pro_above_free', tier: 'PRO' });
  });
});
