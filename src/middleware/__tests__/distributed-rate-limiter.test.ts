import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { LicenseTier, LicenseStatus } from '../../types/license';
import type { License } from '../../types/license';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

const rateLimitFn = vi.fn();

function buildMockRedis() {
  return {
    defineCommand: vi.fn(),
    rateLimit: rateLimitFn,
    status: vi.fn().mockResolvedValue('ready'),
    ping: vi.fn().mockResolvedValue('PONG'),
  };
}

const mockRedis = buildMockRedis();

vi.mock('../../redis', () => ({
  getRedisClient: () => mockRedis,
}));

const mockGetLicenseByKey = vi.fn();

vi.mock('../../billing/license-service', () => ({
  LicenseService: {
    getInstance: () => ({
      getLicenseByKey: mockGetLicenseByKey,
    }),
  },
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// SUT import (after mocks)
// ---------------------------------------------------------------------------

import { distributedRateLimiter } from '../distributed-rate-limiter';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

interface MockResponse {
  _statusCode: number;
  _headers: Record<string, string>;
  _jsonBody: unknown;
  status: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    _statusCode: 200,
    _headers: {},
    _jsonBody: null,
    status: vi.fn().mockImplementation(function (code: number) {
      res._statusCode = code;
      return res;
    }),
    setHeader: vi.fn().mockImplementation(function (name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
    }),
    json: vi.fn().mockImplementation(function (body: unknown) {
      res._jsonBody = body;
      return res;
    }),
  };
  return res;
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    originalUrl: '/api/trades',
    url: '/api/trades',
    headers: {},
    ip: '10.0.0.1',
    ...overrides,
  } as Request;
}

function makeProLicense(overrides: Partial<License> = {}): License {
  return {
    id: 'lic_test_pro',
    name: 'Pro License',
    key: 'RAAS-RPP-ABCD1234-EFGH5678',
    tier: LicenseTier.PRO,
    status: LicenseStatus.ACTIVE,
    createdAt: new Date().toISOString(),
    usageCount: 0,
    tenantId: 'tenant-pro-42',
    ...overrides,
  };
}

function makeFreeLicense(overrides: Partial<License> = {}): License {
  return {
    id: 'lic_test_free',
    name: 'Free License',
    key: 'RAAS-FREE-JKL1234-MNOP5678',
    tier: LicenseTier.FREE,
    status: LicenseStatus.ACTIVE,
    createdAt: new Date().toISOString(),
    usageCount: 0,
    tenantId: 'tenant-free-99',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('distributedRateLimiter middleware (unit)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset mock Redis to a fresh state each test
    const fresh = buildMockRedis();
    Object.assign(mockRedis, fresh);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Excluded routes skip rate limiting
  // -----------------------------------------------------------------------
  describe('excluded routes', () => {
    it('should call next() and skip Redis for /api/health', async () => {
      const req = createMockReq({ originalUrl: '/api/health', url: '/api/health' });
      const res = createMockRes();
      const next = vi.fn();

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.rateLimit).not.toHaveBeenCalled();
      expect(mockRedis.defineCommand).not.toHaveBeenCalled();
    });

    it('should call next() and skip Redis for /api/webhooks', async () => {
      const req = createMockReq({ originalUrl: '/api/webhooks/nowpayments', url: '/api/webhooks/nowpayments' });
      const res = createMockRes();
      const next = vi.fn();

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.rateLimit).not.toHaveBeenCalled();
    });

    it('should call next() and skip Redis for /api/auth', async () => {
      const req = createMockReq({ originalUrl: '/api/auth/login', url: '/api/auth/login' });
      const res = createMockRes();
      const next = vi.fn();

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockRedis.rateLimit).not.toHaveBeenCalled();
    });

    it('should not skip non-excluded routes', async () => {
      const req = createMockReq({ originalUrl: '/api/trades/active', url: '/api/trades/active' });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 1]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(mockRedis.rateLimit).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Anonymous request (no API key) -> FREE tier
  // -----------------------------------------------------------------------
  describe('anonymous requests', () => {
    it('should apply FREE tier when no API key is provided', async () => {
      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: {},
        ip: '192.168.1.100',
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 2]); // allowed, currentCount=2

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(mockGetLicenseByKey).not.toHaveBeenCalled();
      // FREE tier = 10 req/min, currentCount=2 => remaining = 8
      expect(res._headers['x-ratelimit-limit']).toBe('10');
      expect(res._headers['x-ratelimit-remaining']).toBe('8');
      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{192.168.1.100}',
        expect.any(Number),
        60000,
        10,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should fall back to "anonymous" when IP is not available', async () => {
      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: {},
        ip: undefined as unknown as string,
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 1]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{anonymous}',
        expect.any(Number),
        60000,
        10,
      );
      expect(next).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Valid API key with active PRO license -> PRO tier limits
  // -----------------------------------------------------------------------
  describe('authenticated PRO tier requests', () => {
    it('should apply PRO tier limits for a valid active PRO license via x-api-key', async () => {
      const proLicense = makeProLicense();
      mockGetLicenseByKey.mockReturnValue(proLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': proLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 42]); // allowed, currentCount=42

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(mockGetLicenseByKey).toHaveBeenCalledWith(proLicense.key);
      expect(res._headers['x-ratelimit-limit']).toBe('100');
      expect(res._headers['x-ratelimit-remaining']).toBe('58'); // 100 - 42
      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{tenant-pro-42}',
        expect.any(Number),
        60000,
        100,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should apply ENTERPRISE tier limits for a valid ENTERPRISE license', async () => {
      const entLicense: License = {
        id: 'lic_ent_1',
        name: 'Enterprise License',
        key: 'RAAS-REP-ENTR1234-ENTR5678',
        tier: LicenseTier.ENTERPRISE,
        status: LicenseStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        usageCount: 0,
        tenantId: 'tenant-ent-7',
      };
      mockGetLicenseByKey.mockReturnValue(entLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': entLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 300]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._headers['x-ratelimit-limit']).toBe('1000');
      expect(res._headers['x-ratelimit-remaining']).toBe('700'); // 1000 - 300
      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{tenant-ent-7}',
        expect.any(Number),
        60000,
        1000,
      );
      expect(next).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Rate limit exceeded -> 429 response
  // -----------------------------------------------------------------------
  describe('rate limit exceeded', () => {
    it('should return 429 with correct headers and JSON body', async () => {
      const freeLicense = makeFreeLicense();
      mockGetLicenseByKey.mockReturnValue(freeLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': freeLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([0, 10]); // blocked, currentCount=10

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._statusCode).toBe(429);
      expect(res._headers['x-ratelimit-limit']).toBe('10');
      expect(res._headers['x-ratelimit-remaining']).toBe('0');
      expect(res._jsonBody).toEqual({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Upgrade your plan for higher limits.',
        tier: LicenseTier.FREE,
        limit: 10,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should not call next() when rate limit is exceeded', async () => {
      const proLicense = makeProLicense();
      mockGetLicenseByKey.mockReturnValue(proLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': proLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([0, 100]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._statusCode).toBe(429);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Redis failure -> fail-open (next() called, no error thrown)
  // -----------------------------------------------------------------------
  describe('fail-open on Redis errors', () => {
    it('should call next() and not throw when Redis rateLimit rejects', async () => {
      const proLicense = makeProLicense();
      mockGetLicenseByKey.mockReturnValue(proLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': proLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockRejectedValue(new Error('Redis connection refused'));

      // Should not throw
      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res._statusCode).toBe(200); // default, never set to 429
      expect(res._headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('should call next() when Redis is not available (getRedisClient itself does not throw)', async () => {
      const req = createMockReq({
        originalUrl: '/api/trades',
      });
      const res = createMockRes();
      const next = vi.fn();

      // Redis client is still returned but rateLimit throws
      rateLimitFn.mockRejectedValue(new Error('ERR max number of clients reached'));

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Bearer token extraction from Authorization header
  // -----------------------------------------------------------------------
  describe('Bearer token extraction', () => {
    it('should extract API key from Authorization: Bearer header', async () => {
      const proLicense = makeProLicense();
      mockGetLicenseByKey.mockReturnValue(proLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: {
          authorization: `Bearer ${proLicense.key}`,
        },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 5]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(mockGetLicenseByKey).toHaveBeenCalledWith(proLicense.key);
      expect(res._headers['x-ratelimit-limit']).toBe('100');
      expect(res._headers['x-ratelimit-remaining']).toBe('95'); // 100 - 5
      expect(next).toHaveBeenCalled();
    });

    it('should prefer x-api-key over Authorization header', async () => {
      const proLicense = makeProLicense();
      const anotherLicense = makeProLicense({ key: 'RAAS-RPP-OTHER-KEY-HERE' });
      mockGetLicenseByKey.mockImplementation((key: string) => {
        if (key === proLicense.key) return proLicense;
        return null;
      });

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: {
          'x-api-key': proLicense.key,
          authorization: `Bearer ${anotherLicense.key}`,
        },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 12]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      // Should use x-api-key (proLicense), not Bearer token
      expect(mockGetLicenseByKey).toHaveBeenCalledWith(proLicense.key);
      expect(mockGetLicenseByKey).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalled();
    });

    it('should ignore non-Bearer Authorization header formats', async () => {
      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: {
          authorization: 'Basic YWRtaW46cGFzc3dvcmQ=',
        },
        ip: '10.10.10.10',
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 1]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      // Basic auth should not be treated as Bearer -> falls back to FREE
      expect(mockGetLicenseByKey).not.toHaveBeenCalled();
      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{10.10.10.10}',
        expect.any(Number),
        60000,
        10,
      );
      expect(next).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. X-RateLimit headers set correctly on allowed requests
  // -----------------------------------------------------------------------
  describe('X-RateLimit headers', () => {
    it('should set correct headers for FREE tier on first request', async () => {
      const freeLicense = makeFreeLicense();
      mockGetLicenseByKey.mockReturnValue(freeLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': freeLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      // First request: allowed, currentCount becomes 1 after being added
      rateLimitFn.mockResolvedValue([1, 1]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._headers['x-ratelimit-limit']).toBe('10');
      expect(res._headers['x-ratelimit-remaining']).toBe('9'); // 10 - 1
    });

    it('should show 0 remaining when at limit but NOT blocked (boundary)', async () => {
      const proLicense = makeProLicense();
      mockGetLicenseByKey.mockReturnValue(proLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': proLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      // Current count = limit but request IS allowed (edge: Lua allows if < limit, not <=)
      // currentCount after adding = 100
      rateLimitFn.mockResolvedValue([1, 100]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._headers['x-ratelimit-limit']).toBe('100');
      // limit - currentCount = 0, but Math.max(0, 0) = 0
      expect(res._headers['x-ratelimit-remaining']).toBe('0');
      expect(next).toHaveBeenCalled();
    });

    it('should keep remaining non-negative via Math.max', async () => {
      const proLicense = makeProLicense();
      mockGetLicenseByKey.mockReturnValue(proLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': proLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      // Edge case: currentCount > limit (should not normally happen but guard)
      rateLimitFn.mockResolvedValue([1, 150]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._headers['x-ratelimit-remaining']).toBe('0'); // Math.max(0, -50)
    });
  });

  // -----------------------------------------------------------------------
  // 8. Invalid/expired license key -> falls back to FREE tier
  // -----------------------------------------------------------------------
  describe('invalid or inactive license keys', () => {
    it('should fall back to FREE tier when license key is not found', async () => {
      mockGetLicenseByKey.mockReturnValue(undefined);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': 'RAAS-RPP-BOGUS-KEY-TROLOLO' },
        ip: '203.0.113.42',
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 1]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(mockGetLicenseByKey).toHaveBeenCalledWith('RAAS-RPP-BOGUS-KEY-TROLOLO');
      expect(res._headers['x-ratelimit-limit']).toBe('10');
      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{203.0.113.42}',
        expect.any(Number),
        60000,
        10,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should fall back to FREE tier when license status is expired', async () => {
      const expiredLicense = makeProLicense({ status: LicenseStatus.EXPIRED });
      mockGetLicenseByKey.mockReturnValue(expiredLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': expiredLicense.key },
        ip: '198.51.100.7',
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 5]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._headers['x-ratelimit-limit']).toBe('10'); // FREE, not PRO
      expect(rateLimitFn).toHaveBeenCalledWith(
        'ratelimit:{198.51.100.7}',
        expect.any(Number),
        60000,
        10,
      );
      expect(next).toHaveBeenCalled();
    });

    it('should fall back to FREE tier when license status is revoked', async () => {
      const revokedLicense = makeProLicense({ status: LicenseStatus.REVOKED });
      mockGetLicenseByKey.mockReturnValue(revokedLicense);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': revokedLicense.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 1]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      expect(res._headers['x-ratelimit-limit']).toBe('10'); // FREE
      expect(next).toHaveBeenCalled();
    });

    it('should use license.id as tenantId when tenantId is not set on license', async () => {
      const licenseNoTenant = makeProLicense({ tenantId: undefined });
      mockGetLicenseByKey.mockReturnValue(licenseNoTenant);

      const req = createMockReq({
        originalUrl: '/api/trades',
        headers: { 'x-api-key': licenseNoTenant.key },
      });
      const res = createMockRes();
      const next = vi.fn();

      rateLimitFn.mockResolvedValue([1, 3]);

      await distributedRateLimiter(req, res as unknown as Response, next);

      // Should use license.id as fallback tenantId
      expect(rateLimitFn).toHaveBeenCalledWith(
        `ratelimit:{${licenseNoTenant.id}}`,
        expect.any(Number),
        60000,
        100,
      );
      expect(next).toHaveBeenCalled();
    });
  });
});
