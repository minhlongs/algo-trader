/**
 * Open-Core Routes — /verify-license configuration-fault handling
 *
 * The license gate fails closed when LICENSE_HMAC_SECRET is unset, which surfaces in the route as
 * a constructor throw. A missing deployment secret is a server-side fault, so it must answer 503
 * rather than escape the handler unhandled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';

const mocks = vi.hoisted(() => ({
  licenseGateInstance: { verifyToken: vi.fn(), signToken: vi.fn() },
  licenseGateConstructor: vi.fn(),
  loggerError: vi.fn(),
}));

// Throw once, then hand back a usable gate, so the 503 path and the normal path are both
// reachable from the same module without depending on real process.env state.
let constructorShouldThrow = false;

vi.mock('../../../../desk/opencoresaas2026monetization', () => ({
  OPEN_CORE_25_STEPS: [],
  RepositoryBlueprintAuditor: class { auditRepository = vi.fn() },
  OpenCoreSaasMonetizationCoordinator: { evaluate: vi.fn() },
  LicenseGate: class {
    constructor(...args: unknown[]) {
      mocks.licenseGateConstructor(...args);
      if (constructorShouldThrow) {
        throw new Error('LICENSE_HMAC_SECRET is not set.');
      }
      return mocks.licenseGateInstance;
    }
  },
  BillingMeter: class { checkQuota = vi.fn(() => ({ isAllowed: true })); recordConsumption = vi.fn() },
  TIER_ENTITLEMENTS: {},
}));

vi.mock('../../../../shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args: unknown[]) => mocks.loggerError(...args),
    debug: vi.fn(),
  },
}));

import { openCoreRouter } from '../open-core-routes';

/** Express registers handlers on the router stack; drive one directly (no listening socket). */
type ExpressHandler = (req: unknown, res: unknown, next: () => void) => void;

function findHandler(method: string, routePath: string): ExpressHandler {
  const stack = (openCoreRouter as unknown as {
    stack: Array<{
      route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: ExpressHandler }> };
    }>;
  }).stack;
  const layer = stack.find((l) => l.route?.path === routePath && l.route.methods[method]);
  const handle = layer?.route?.stack?.[0]?.handle;
  if (typeof handle !== 'function') {
    throw new Error(`No handler for ${method.toUpperCase()} ${routePath}`);
  }
  return handle;
}

function stubRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

function licenseRequest(overrides: Record<string, unknown> = {}) {
  return { body: { token: 'a.b', requiredTier: 'BASIC', ...overrides } } as never;
}

describe('POST /api/v1/open-core/verify-license', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructorShouldThrow = false;
  });

  it('answers 503 when the signing key is not configured', () => {
    constructorShouldThrow = true;
    const res = stubRes();

    expect(() => findHandler('post', '/verify-license')(licenseRequest(), res as never, () => {})).not.toThrow();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ isValid: false, statusCode: 503 });
  });

  it('does not leak the configuration error text to the caller', () => {
    constructorShouldThrow = true;
    const res = stubRes();

    findHandler('post', '/verify-license')(licenseRequest(), res as never, () => {});

    expect(JSON.stringify(res.body)).not.toContain('LICENSE_HMAC_SECRET');
    expect(mocks.loggerError).toHaveBeenCalled();
  });

  it('proceeds to token verification when the gate constructs successfully', () => {
    mocks.licenseGateInstance.verifyToken.mockReturnValue({
      isValid: true,
      statusCode: 200,
      payload: { tenantId: 't-1', tier: 'BASIC', expiresAt: Date.now() + 60_000 },
    });
    const res = stubRes();

    findHandler('post', '/verify-license')(licenseRequest(), res as never, () => {});

    expect(mocks.licenseGateInstance.verifyToken).toHaveBeenCalledWith('a.b', 'BASIC');
    expect(res.statusCode).toBe(200);
  });

  it('still rejects a malformed payload before the gate is constructed', () => {
    const res = stubRes();

    findHandler('post', '/verify-license')({ body: { requiredTier: 'BASIC' } } as never, res as never, () => {});

    expect(res.statusCode).toBe(400);
    expect(mocks.licenseGateConstructor).not.toHaveBeenCalled();
  });
});
