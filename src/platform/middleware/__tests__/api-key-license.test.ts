/**
 * Tests for api-key-license — apiKeyLicenseMiddleware.
 *
 * Covers: no API key (anonymous), non-string API key, license found,
 * license not found, and lookup error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../shared/utils/logger', () => ({ logger: mockLogger }));

const { mockGetLicenseByKey } = vi.hoisted(() => ({
  mockGetLicenseByKey: vi.fn(),
}));
vi.mock('../../billing/license-service', () => ({
  LicenseService: {
    getInstance: vi.fn(() => ({
      getLicenseByKey: mockGetLicenseByKey,
    })),
  },
}));

import { apiKeyLicenseMiddleware } from '../api-key-license';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(headers: Record<string, unknown> = {}): any {
  return { headers };
}

function makeRes(): any {
  return {} as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('apiKeyLicenseMiddleware', () => {
  it('calls next immediately when no x-api-key header', () => {
    const req = makeReq();
    const nextFn = vi.fn();
    apiKeyLicenseMiddleware(req, makeRes(), nextFn);
    expect(nextFn).toHaveBeenCalledOnce();
    expect(req.license).toBeUndefined();
  });

  it('calls next immediately when x-api-key is not a string (e.g. array)', () => {
    const req = makeReq({ 'x-api-key': ['key1', 'key2'] });
    const nextFn = vi.fn();
    apiKeyLicenseMiddleware(req, makeRes(), nextFn);
    expect(nextFn).toHaveBeenCalledOnce();
    expect(req.license).toBeUndefined();
  });

  it('attaches license to req when API key matches a license', () => {
    const fakeLicense = { id: 'lic-123', tier: 'PREMIUM', userId: 'u1' };
    mockGetLicenseByKey.mockReturnValue(fakeLicense);

    const req = makeReq({ 'x-api-key': 'valid-key' });
    const nextFn = vi.fn();
    apiKeyLicenseMiddleware(req, makeRes(), nextFn);

    expect(mockGetLicenseByKey).toHaveBeenCalledWith('valid-key');
    expect(req.license).toBe(fakeLicense);
    expect(nextFn).toHaveBeenCalledOnce();
  });

  it('does not attach license when API key lookup returns undefined', () => {
    mockGetLicenseByKey.mockReturnValue(undefined);

    const req = makeReq({ 'x-api-key': 'unknown-key' });
    const nextFn = vi.fn();
    apiKeyLicenseMiddleware(req, makeRes(), nextFn);

    expect(mockGetLicenseByKey).toHaveBeenCalledWith('unknown-key');
    expect(req.license).toBeUndefined();
    expect(nextFn).toHaveBeenCalledOnce();
  });

  it('logs warning and calls next when getLicenseByKey throws', () => {
    mockGetLicenseByKey.mockImplementation(() => { throw new Error('DB connection lost'); });

    const req = makeReq({ 'x-api-key': 'error-key' });
    const nextFn = vi.fn();
    apiKeyLicenseMiddleware(req, makeRes(), nextFn);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[apiKeyLicense] Failed to resolve license from API key',
      expect.objectContaining({ error: expect.stringContaining('DB connection lost') }),
    );
    expect(nextFn).toHaveBeenCalledOnce();
    expect(req.license).toBeUndefined();
  });

  it('always calls next even on error (error does not abort request)', () => {
    mockGetLicenseByKey.mockImplementation(() => { throw new Error('unexpected'); });

    const req = makeReq({ 'x-api-key': 'bad' });
    const nextFn = vi.fn();
    apiKeyLicenseMiddleware(req, makeRes(), nextFn);

    expect(nextFn).toHaveBeenCalledOnce();
  });
});