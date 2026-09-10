/**
 * dashboard-middleware — Unit Tests
 *
 * Tests CORS, security headers, JWT authentication, and admin role checks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyCors, applySecurityHeaders, authenticateRequest, requireAdmin } from '../../../../src/platform/dashboard/dashboard-middleware';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyJwt } from '../../../../src/platform/api/auth-middleware';

const { mockVerifyJwt, mockLogger } = vi.hoisted(() => ({
  mockVerifyJwt: vi.fn(),
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../../src/platform/api/auth-middleware', () => ({
  verifyJwt: mockVerifyJwt,
}));

function createMockReq(headers: Record<string, string | undefined> = {}): IncomingMessage {
  return {
    headers,
  } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse {
  const res: Partial<ServerResponse> = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as ServerResponse;
}

describe('applyCors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets CORS headers for allowed origin', () => {
    const req = createMockReq({ origin: 'https://cashclaw.cc' });
    const res = createMockRes();

    applyCors(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://cashclaw.cc');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  });

  it('sets CORS headers for localhost origin', () => {
    const req = createMockReq({ origin: 'http://localhost:3000' });
    const res = createMockRes();

    applyCors(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:3000');
  });

  it('does not set CORS headers for disallowed origin', () => {
    const req = createMockReq({ origin: 'https://evil.com' });
    const res = createMockRes();

    applyCors(req, res);

    expect(res.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://evil.com');
  });

  it('does not set CORS headers when no origin header', () => {
    const req = createMockReq({});
    const res = createMockRes();

    applyCors(req, res);

    expect(res.setHeader).not.toHaveBeenCalledWith(
      expect.stringContaining('Access-Control-Allow-Origin'),
      expect.anything(),
    );
  });
});

describe('applySecurityHeaders', () => {
  it('sets standard security headers', () => {
    const res = createMockRes();

    applySecurityHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(res.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  it('sets Content-Security-Policy header', () => {
    const res = createMockRes();

    applySecurityHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining("default-src 'self'"));
  });
});

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyJwt.mockReturnValue({ sub: 'user-1', email: 'test@example.com', role: 'admin' });
  });

  it('returns true when no JWT_SECRET (single-operator mode)', () => {
    const req = createMockReq({});
    const res = createMockRes();

    const result = authenticateRequest(req, res, '');

    expect(result).toBe(true);
  });

  it('returns false and sends 401 when no Authorization header', () => {
    const req = createMockReq({});
    const res = createMockRes();

    const result = authenticateRequest(req, res, 'secret');

    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.objectContaining({
      'Content-Type': 'application/json; charset=utf-8',
    }));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Missing Authorization'));
  });

  it('returns false and sends 401 when Authorization header missing Bearer prefix', () => {
    const req = createMockReq({ authorization: 'InvalidToken' });
    const res = createMockRes();

    const result = authenticateRequest(req, res, 'secret');

    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Missing Authorization'));
  });

  it('returns false and sends 401 when JWT verification fails', () => {
    mockVerifyJwt.mockReturnValueOnce(null);
    const req = createMockReq({ authorization: 'Bearer invalid-token' });
    const res = createMockRes();

    const result = authenticateRequest(req, res, 'secret');

    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Invalid or expired token'));
  });

  it('returns AuthPayload with user role on valid token', () => {
    mockVerifyJwt.mockReturnValueOnce({ sub: 'user-2', email: 'user@example.com', role: 'user' });
    const req = createMockReq({ authorization: 'Bearer valid-token' });
    const res = createMockRes();

    const result = authenticateRequest(req, res, 'secret');

    expect(result).toEqual({ sub: 'user-2', email: 'user@example.com', role: 'user' });
  });

  it('returns AuthPayload with admin role on valid token', () => {
    mockVerifyJwt.mockReturnValueOnce({ sub: 'admin-1', email: 'admin@example.com', role: 'admin' });
    const req = createMockReq({ authorization: 'Bearer admin-token' });
    const res = createMockRes();

    const result = authenticateRequest(req, res, 'secret');

    expect(result).toEqual({ sub: 'admin-1', email: 'admin@example.com', role: 'admin' });
  });

  it('defaults role to user when payload has no role', () => {
    mockVerifyJwt.mockReturnValueOnce({ sub: 'user-3', email: 'no-role@example.com' });
    const req = createMockReq({ authorization: 'Bearer no-role-token' });
    const res = createMockRes();

    const result = authenticateRequest(req, res, 'secret');

    expect(result).toEqual({ sub: 'user-3', email: 'no-role@example.com', role: 'user' });
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyJwt.mockReturnValue({ sub: 'user-1', email: 'test@example.com', role: 'user' });
  });

  it('returns true when no JWT_SECRET (single-operator mode)', () => {
    const req = createMockReq({});
    const res = createMockRes();

    const result = requireAdmin(req, res, '');

    expect(result).toBe(true);
  });

  it('returns false when authenticateRequest returns false', () => {
    const req = createMockReq({});
    const res = createMockRes();

    const result = requireAdmin(req, res, 'secret');

    expect(result).toBe(false);
  });

  it('returns true when authenticateRequest returns true (no JWT_SECRET)', () => {
    const req = createMockReq({});
    const res = createMockRes();

    const result = requireAdmin(req, res, '');

    expect(result).toBe(true);
  });

  it('returns false and sends 403 when user is not admin', () => {
    mockVerifyJwt.mockReturnValueOnce({ sub: 'user-1', email: 'user@example.com', role: 'user' });
    const req = createMockReq({ authorization: 'Bearer user-token' });
    const res = createMockRes();

    const result = requireAdmin(req, res, 'secret');

    expect(result).toBe(false);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Admin access required'));
  });

  it('returns true when user is admin', () => {
    mockVerifyJwt.mockReturnValueOnce({ sub: 'admin-1', email: 'admin@example.com', role: 'admin' });
    const req = createMockReq({ authorization: 'Bearer admin-token' });
    const res = createMockRes();

    const result = requireAdmin(req, res, 'secret');

    expect(result).toBe(true);
  });
});