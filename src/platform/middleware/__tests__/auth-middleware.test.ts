/**
 * Auth Middleware — Integration Tests
 *
 * Covers the authMiddleware function which resolves identity from JWT.
 * Tests: no secret, no token, invalid token, expired token, valid token,
 * sub missing (req.user not set), valid token with all claims.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import request from 'supertest';

const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/utils/logger', () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() },
}));

import { authMiddleware } from '../auth-middleware';

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(authMiddleware);
  a.get('/test', (_req: Request, res: Response) => {
    res.json({
      hasClaims: !!_req.claims,
      claims: _req.claims,
      hasUser: !!_req.user,
      user: _req.user,
    });
  });
  return a;
}

const JWT_SECRET = 'test-secret-key-for-testing-purposes-only-32chars';

function createValidJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const crypto = require('node:crypto');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('no JWT_SECRET configured (single-operator mode)', () => {
    it('continues as anonymous when JWT_SECRET is not set', async () => {
      delete process.env.JWT_SECRET;

      const res = await request(app()).get('/test');

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });

    it('continues as anonymous when JWT_SECRET is empty string', async () => {
      process.env.JWT_SECRET = '';

      const res = await request(app()).get('/test');

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });
  });

  describe('no Authorization header', () => {
    it('continues as anonymous when no auth header', async () => {
      const res = await request(app()).get('/test');

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });

    it('continues as anonymous when auth header is not Bearer', async () => {
      const res = await request(app()).get('/test').set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });
  });

  describe('invalid token', () => {
    it('continues as anonymous when token is malformed (not 3 parts)', async () => {
      const res = await request(app()).get('/test').set('Authorization', 'Bearer not.a.valid.token.here');

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });

    it('continues as anonymous when signature is invalid', async () => {
      const payload = { sub: 'user-123', email: 'test@example.com', tier: 'pro' };
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const badSignature = 'invalidsignature';
      const token = `${header}.${body}.${badSignature}`;

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });

    it('continues as anonymous when token body is invalid JSON', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from('not-json').toString('base64url');
      const crypto = require('node:crypto');
      const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
      const token = `${header}.${body}.${signature}`;

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });
  });

  describe('expired token', () => {
    it('continues as anonymous when token is expired', async () => {
      const payload = { sub: 'user-123', email: 'test@example.com', tier: 'pro', exp: Math.floor(Date.now() / 1000) - 3600 };
      const token = createValidJwt(payload);

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);
    });
  });

  describe('valid token', () => {
    it('attaches claims and user when token is valid with all fields', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-456',
        tier: 'pro',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = createValidJwt(payload);

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(true);
      expect(res.body.claims).toMatchObject({
        sub: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        tenantId: 'tenant-456',
        tier: 'pro',
      });
      expect(res.body.hasUser).toBe(true);
      expect(res.body.user).toMatchObject({
        id: 'user-123',
        tenantId: 'tenant-456',
        tier: 'PRO',
        role: 'admin',
      });
    });

    it('attaches claims and user when token has minimal fields (sub only)', async () => {
      const payload = { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = createValidJwt(payload);

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(true);
      expect(res.body.claims.sub).toBe('user-123');
      expect(res.body.claims.email).toBeUndefined();
      expect(res.body.hasUser).toBe(true);
      expect(res.body.user).toMatchObject({
        id: 'user-123',
        tenantId: 'user-123', // falls back to sub
        tier: 'FREE', // defaults to FREE
      });
      expect('role' in res.body.user).toBe(false); // role key absent entirely
    });

    it('sets tier to uppercase from token', async () => {
      const payload = { sub: 'user-123', tier: 'enterprise', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = createValidJwt(payload);

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.tier).toBe('ENTERPRISE');
    });

    it('does not set req.user when sub is missing from token', async () => {
      const payload = { email: 'test@example.com', tier: 'pro', exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = createValidJwt(payload);

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(true);
      expect(res.body.claims.sub).toBeUndefined();
      expect(res.body.hasUser).toBe(false);
    });

    it('handles non-string claim values gracefully (ignores them)', async () => {
      const payload = {
        sub: 'user-123',
        email: 123, // non-string
        role: null, // non-string
        tier: 'pro',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = createValidJwt(payload);

      const res = await request(app()).get('/test').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.claims.sub).toBe('user-123');
      expect(res.body.claims.email).toBeUndefined();
      expect(res.body.claims.role).toBeUndefined();
      expect(res.body.claims.tier).toBe('pro');
    });
  });

  describe('error handling', () => {
    it('continues as anonymous when JWT verification throws unexpectedly', async () => {
      // Force an error by mocking createHmac to throw
      const crypto = require('node:crypto');
      const originalCreateHmac = crypto.createHmac;
      crypto.createHmac = vi.fn(() => {
        throw new Error('crypto failure');
      });

      const res = await request(app()).get('/test').set('Authorization', 'Bearer some.token.here');

      expect(res.status).toBe(200);
      expect(res.body.hasClaims).toBe(false);
      expect(res.body.hasUser).toBe(false);

      crypto.createHmac = originalCreateHmac;
    });
  });
});