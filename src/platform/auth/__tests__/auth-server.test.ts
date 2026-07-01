/**
 * Tests for Better Auth server instance (src/auth/auth-server.ts)
 *
 * Verifies configuration shape, session settings, email/password config,
 * trusted origins, database pool wiring, secret fallback chain, and
 * logger configuration. Mocks better-auth, pg, and logger to isolate
 * the configuration logic from actual service instantiation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (evaluated before any module import) ──

const mockBetterAuth = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

/** Captured constructor arguments from every `new Pool(config)` call. */
const poolConfigCalls = vi.hoisted(() => new Array<Record<string, unknown>>());

vi.mock('better-auth', () => ({
  betterAuth: mockBetterAuth,
}));

vi.mock('pg', () => {
  class MockPool {
    constructor(config: Record<string, unknown>) {
      poolConfigCalls.push(config);
      Object.assign(this, config);
    }
  }
  return { default: { Pool: MockPool } };
});

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helpers ──

/** Extract the config object passed to betterAuth() on its first call. */
function getAuthConfig(): Record<string, unknown> | undefined {
  return mockBetterAuth.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

/** Return the config object from the first `new Pool(...)` call. */
function getPoolConfig(): Record<string, unknown> | undefined {
  return poolConfigCalls[0];
}

function deleteEnvKeys(): void {
  for (const key of [
    'BETTER_AUTH_SECRET',
    'JWT_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'BETTER_AUTH_URL',
    'API_BASE_URL',
    'NODE_ENV',
  ]) {
    delete process.env[key];
  }
}

function setEnv(vars: Record<string, string>): void {
  Object.assign(process.env, vars);
}

// ── Tests ──

describe('auth-server', () => {
  beforeEach(() => {
    vi.resetModules();
    mockBetterAuth.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    poolConfigCalls.length = 0;

    mockBetterAuth.mockReturnValue({ api: {}, handler: vi.fn() });

    deleteEnvKeys();
    setEnv({
      BETTER_AUTH_SECRET: 'test-minimum-32-character-secret!!',
      BETTER_AUTH_URL: 'https://cashclaw.cc',
    });
  });

  // ── 1. Configuration shape (happy path) ──

  describe('configuration shape', () => {
    it('calls betterAuth with all required top-level keys', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config, 'betterAuth must receive a config object').toBeDefined();
      const keys = Object.keys(config!);
      expect(keys).toContain('database');
      expect(keys).toContain('secret');
      expect(keys).toContain('baseURL');
      expect(keys).toContain('basePath');
      expect(keys).toContain('emailAndPassword');
      expect(keys).toContain('session');
      expect(keys).toContain('trustedOrigins');
    });

    it('sets basePath to /api/auth', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config!.basePath).toBe('/api/auth');
    });

    it('uses BETTER_AUTH_URL as baseURL when set', async () => {
      setEnv({ BETTER_AUTH_URL: 'https://example.com' });
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config!.baseURL).toBe('https://example.com');
    });

    it('falls back to API_BASE_URL when BETTER_AUTH_URL is unset', async () => {
      delete process.env.BETTER_AUTH_URL;
      setEnv({ API_BASE_URL: 'https://api.example.com' });
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config!.baseURL).toBe('https://api.example.com');
    });
  });

  // ── 2. Session expiry configuration ──

  describe('session configuration', () => {
    it('sets session expiry to 7 days (604800 seconds)', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const session = config!.session as Record<string, unknown>;
      expect(session.expiresIn).toBe(60 * 60 * 24 * 7);
    });

    it('sets updateAge to 24 hours', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const session = config!.session as Record<string, unknown>;
      expect(session.updateAge).toBe(60 * 60 * 24);
    });

    it('enables cookie cache with 5-minute maxAge', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const session = config!.session as Record<string, unknown>;
      const cookieCache = session.cookieCache as Record<string, unknown>;
      expect(cookieCache.enabled).toBe(true);
      expect(cookieCache.maxAge).toBe(60 * 5);
    });
  });

  // ── 3. Email/password configuration ──

  describe('emailAndPassword configuration', () => {
    it('has emailAndPassword enabled', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const eap = config!.emailAndPassword as Record<string, unknown>;
      expect(eap.enabled).toBe(true);
    });

    it('has autoSignIn enabled', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const eap = config!.emailAndPassword as Record<string, unknown>;
      expect(eap.autoSignIn).toBe(true);
    });

    it('requires minimum password length of 8', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const eap = config!.emailAndPassword as Record<string, unknown>;
      expect(eap.minPasswordLength).toBe(8);
    });
  });

  // ── 4. Auth instance export ──

  describe('auth export', () => {
    it('exports a defined auth instance', async () => {
      const module = await import('../auth-server');

      expect(module.auth, 'auth must be exported and defined').toBeDefined();
      expect(typeof module.auth).toBe('object');
    });

    it('returns the exact value that betterAuth() produced', async () => {
      const fakeInstance = { api: {}, handler: vi.fn(), options: { secret: 'x' } };
      mockBetterAuth.mockReturnValue(fakeInstance);

      const module = await import('../auth-server');
      expect(module.auth).toBe(fakeInstance);
    });
  });

  // ── 5. Secret fallback chain (2 error paths) ──

  describe('secret configuration', () => {
    it('uses BETTER_AUTH_SECRET as primary secret', async () => {
      setEnv({ BETTER_AUTH_SECRET: 'primary-secret-at-least-32-chars!!' });
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config!.secret).toBe('primary-secret-at-least-32-chars!!');
    });

    it('falls back to JWT_SECRET when BETTER_AUTH_SECRET is unset', async () => {
      delete process.env.BETTER_AUTH_SECRET;
      setEnv({ JWT_SECRET: 'jwt-fallback-secret-at-least-32-chars!!' });
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config!.secret).toBe('jwt-fallback-secret-at-least-32-chars!!');
    });

    it('throws when neither secret is set (fail-fast)', async () => {
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.JWT_SECRET;
      await expect(import('../auth-server')).rejects.toThrow(
        'BETTER_AUTH_SECRET or JWT_SECRET must be set',
      );
    });

    it('throws when no secret is configured (was warn, now fail-fast)', async () => {
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.JWT_SECRET;
      await expect(import('../auth-server')).rejects.toThrow(
        'BETTER_AUTH_SECRET or JWT_SECRET must be set',
      );
    });

    it('does NOT warn when BETTER_AUTH_SECRET is set', async () => {
      setEnv({ BETTER_AUTH_SECRET: 'present-secret-at-least-32-chars!!' });
      await import('../auth-server');

      const noSecretCalls = mockLoggerWarn.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('No BETTER_AUTH_SECRET'),
      );
      expect(noSecretCalls).toHaveLength(0);
    });
  });

  // ── 6. Trusted origins list ──

  describe('trusted origins', () => {
    it('includes https://cashclaw.cc', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const origins = config!.trustedOrigins as string[];
      expect(origins).toContain('https://cashclaw.cc');
    });

    it('includes https://algo-trader.pages.dev', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const origins = config!.trustedOrigins as string[];
      expect(origins).toContain('https://algo-trader.pages.dev');
    });

    it('includes https://cashclaw-dashboard.pages.dev', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const origins = config!.trustedOrigins as string[];
      expect(origins).toContain('https://cashclaw-dashboard.pages.dev');
    });

    it('includes localhost origins for local development', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const origins = config!.trustedOrigins as string[];
      expect(origins).toContain('http://localhost:3001');
      expect(origins).toContain('http://localhost:5173');
    });

    it('contains exactly 5 trusted origins', async () => {
      await import('../auth-server');

      const config = getAuthConfig();
      const origins = config!.trustedOrigins as string[];
      expect(origins).toHaveLength(5);
    });
  });

  // ── 7. Database pool configuration ──

  describe('database pool configuration', () => {
    it('uses DB_HOST when set', async () => {
      setEnv({ DB_HOST: 'pg.example.com' });
      await import('../auth-server');

      expect(poolConfigCalls.length).toBe(1);
      const poolCfg = getPoolConfig();
      expect(poolCfg!.host).toBe('pg.example.com');
    });

    it('defaults DB_HOST to localhost when unset', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.host).toBe('localhost');
    });

    it('parses DB_PORT as integer', async () => {
      setEnv({ DB_PORT: '15432' });
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.port).toBe(15432);
    });

    it('defaults DB_PORT to 5432 when unset', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.port).toBe(5432);
    });

    it('caps pool max connections at 5', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.max).toBe(5);
    });

    it('uses DB_NAME when set', async () => {
      setEnv({ DB_NAME: 'custom_db' });
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.database).toBe('custom_db');
    });

    it('defaults DB_NAME to algo_trader when unset', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.database).toBe('algo_trader');
    });

    it('uses DB_USER when set', async () => {
      setEnv({ DB_USER: 'custom_user' });
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.user).toBe('custom_user');
    });

    it('defaults DB_USER to postgres when unset', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.user).toBe('postgres');
    });

    it('uses DB_PASSWORD when set', async () => {
      setEnv({ DB_PASSWORD: 's3cret!' });
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.password).toBe('s3cret!');
    });

    it('defaults DB_PASSWORD to empty string when unset', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.password).toBe('');
    });
  });

  // ── 8. Logger configuration ──

  describe('logger configuration', () => {
    it('sets log level to error in production', async () => {
      setEnv({ NODE_ENV: 'production' });
      await import('../auth-server');

      const config = getAuthConfig();
      const loggerCfg = config!.logger as Record<string, unknown>;
      expect(loggerCfg.level).toBe('error');
      expect(loggerCfg.disabled).toBe(false);
    });

    it('sets log level to debug in non-production environments', async () => {
      setEnv({ NODE_ENV: 'development' });
      await import('../auth-server');

      const config = getAuthConfig();
      const loggerCfg = config!.logger as Record<string, unknown>;
      expect(loggerCfg.level).toBe('debug');
    });
  });

  // ── Error paths: edge cases that must not throw ──

  describe('graceful degradation', () => {
    it('passes empty string for DB_PASSWORD when unset (does not crash)', async () => {
      await import('../auth-server');

      const poolCfg = getPoolConfig();
      expect(poolCfg!.password).toBe('');
    });

    it('falls back to http://localhost:3000 when both BETTER_AUTH_URL and API_BASE_URL are unset', async () => {
      delete process.env.BETTER_AUTH_URL;
      delete process.env.API_BASE_URL;
      await import('../auth-server');

      const config = getAuthConfig();
      expect(config!.baseURL).toBe('http://localhost:3000');
    });
  });
});
