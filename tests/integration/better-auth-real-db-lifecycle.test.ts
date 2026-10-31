/**
 * Real Database Integration Test for Better Auth Lifecycle & Express Handler
 *
 * Verifies with a REAL Better Auth instance and database backend
 * (isolated PostgreSQL test database `algo_trader_test_auth` when reachable,
 * or real `@better-auth/memory-adapter` in CI environments without a Postgres daemon):
 * 1. User Signup (email/password), Auto-SignIn cookie & session creation, TrialDrip hook
 * 2. Database persistence into "user", "account", and "session" tables
 * 3. Session retrieval via `getSession` with signed session cookie
 * 4. Sign-in with verified credentials and rejection of wrong password
 * 5. Password policy enforcement (minPasswordLength: 8) & duplicate email rejection
 * 6. Session revocation via `signOut` (cookie invalidated + DB session row removed)
 * 7. Express `/api/auth/*` HTTP handler (`auth.handler`) request/response round-trip
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from '@better-auth/memory-adapter';
import pg from 'pg';
import { up as runMigration004 } from '../../src/shared/db/migrations/004-better-auth-tables';

const TEST_DB_NAME = 'algo_trader_test_auth';
const TEST_PG_CONFIG = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  database: process.env.TEST_DB_NAME || TEST_DB_NAME,
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || '',
  max: 2,
};

describe('Better Auth Real DB Lifecycle & Express Handler', () => {
  let pool: pg.Pool | null = null;
  let isPostgres = false;
  let memoryDb: Record<string, unknown[]> = {};
  let testAuth: ReturnType<typeof betterAuth>;
  const trialDripSubscribeSpy = vi.fn();

  beforeAll(async () => {
    try {
      const candidatePool = new pg.Pool(TEST_PG_CONFIG);
      const client = await candidatePool.connect();
      try {
        await runMigration004(client);
        pool = candidatePool;
        isPostgres = true;
      } finally {
        client.release();
      }
    } catch {
      isPostgres = false;
      pool = null;
      memoryDb = { user: [], session: [], account: [], verification: [] };
    }

    testAuth = betterAuth({
      database: isPostgres && pool ? pool : memoryAdapter(memoryDb),
      secret: 'test-real-db-lifecycle-secret-32-chars-min!!',
      baseURL: 'http://localhost:3000',
      basePath: '/api/auth',
      emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        minPasswordLength: 8,
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5,
        },
      },
      databaseHooks: {
        user: {
          create: {
            after: async (user) => {
              if (user.email && user.id) {
                trialDripSubscribeSpy(user.email, user.id, 'FREE', 7);
              }
            },
          },
        },
      },
      trustedOrigins: [
        'https://cashclaw.cc',
        'http://localhost:3001',
        'http://localhost:5173',
      ],
    });
  });

  afterAll(async () => {
    if (pool) {
      try {
        await pool.query(`DELETE FROM "user" WHERE email LIKE 'trader_%@cashclaw.cc' OR email LIKE 'policy_%@cashclaw.cc'`);
      } catch {
        // ignore cleanup error
      }
      await pool.end().catch(() => {});
    }
  });

  it('performs full signup, persists records, verifies cookie session, and revokes on signOut', async () => {
    const testEmail = `trader_${Date.now()}@cashclaw.cc`;
    const testPassword = 'StrongPassword123!';
    const testName = 'Algo Test Trader';

    // 1. Sign up new user and capture response headers (for session cookie)
    const { headers: signUpHeaders, response: signUpRes } = await testAuth.api.signUpEmail({
      returnHeaders: true,
      body: {
        email: testEmail,
        password: testPassword,
        name: testName,
      },
    });

    expect(signUpRes).toBeDefined();
    expect(signUpRes.user.email).toBe(testEmail);
    expect(signUpRes.user.name).toBe(testName);
    expect(signUpRes.token).toBeDefined();

    // Verify TrialDrip after-signup databaseHook fired with synthetic user
    expect(trialDripSubscribeSpy).toHaveBeenCalledWith(
      testEmail,
      signUpRes.user.id,
      'FREE',
      7,
    );

    const setCookie = signUpHeaders.get('set-cookie');
    expect(setCookie, 'signUpEmail must set session cookie when autoSignIn is enabled').toBeTruthy();
    const cookiePair = setCookie!.split(';')[0];

    // 2. If PostgreSQL is active, verify SQL rows in user, session, and account tables
    if (isPostgres && pool) {
      const userRow = await pool.query('SELECT id, email, name FROM "user" WHERE email = $1', [testEmail]);
      expect(userRow.rows).toHaveLength(1);
      expect(userRow.rows[0].id).toBe(signUpRes.user.id);

      const sessionRow = await pool.query('SELECT id, "userId", token FROM session WHERE token = $1', [signUpRes.token]);
      expect(sessionRow.rows).toHaveLength(1);
      expect(sessionRow.rows[0].userId).toBe(signUpRes.user.id);

      const accountRow = await pool.query('SELECT "providerId", "userId" FROM account WHERE "userId" = $1', [signUpRes.user.id]);
      expect(accountRow.rows).toHaveLength(1);
      expect(accountRow.rows[0].providerId).toBe('credential');
    } else {
      expect(memoryDb.user.length).toBeGreaterThanOrEqual(1);
      expect(memoryDb.session.length).toBeGreaterThanOrEqual(1);
    }

    // 3. Verify active session via getSession with cookie
    const sessionRes = await testAuth.api.getSession({
      headers: new Headers({ cookie: cookiePair }),
    });
    expect(sessionRes).not.toBeNull();
    expect(sessionRes?.user.email).toBe(testEmail);
    expect(sessionRes?.session.token).toBe(signUpRes.token);

    // 4. Sign out and confirm session is revoked in both API and database
    await testAuth.api.signOut({
      headers: new Headers({ cookie: cookiePair }),
    });

    const afterSignOut = await testAuth.api.getSession({
      headers: new Headers({ cookie: cookiePair }),
    });
    expect(afterSignOut).toBeNull();

    if (isPostgres && pool) {
      const revokedRow = await pool.query('SELECT id FROM session WHERE token = $1', [signUpRes.token]);
      expect(revokedRow.rows).toHaveLength(0);
    }

    // 5. Sign back in with valid credentials
    const { headers: signInHeaders, response: signInRes } = await testAuth.api.signInEmail({
      returnHeaders: true,
      body: {
        email: testEmail,
        password: testPassword,
      },
    });
    expect(signInRes.user.email).toBe(testEmail);
    expect(signInRes.token).toBeDefined();
    expect(signInHeaders.get('set-cookie')).toBeTruthy();
  });

  it('enforces password policy, blocks duplicate emails, and rejects wrong passwords', async () => {
    const email = `policy_${Date.now()}@cashclaw.cc`;

    // 1. Short password (< 8 chars) rejected
    await expect(
      testAuth.api.signUpEmail({
        body: {
          email,
          password: 'short',
          name: 'Short Password User',
        },
      }),
    ).rejects.toThrow();

    // 2. Valid registration succeeds
    await testAuth.api.signUpEmail({
      body: {
        email,
        password: 'ValidPassword123!',
        name: 'Policy User',
      },
    });

    // 3. Duplicate email rejected
    await expect(
      testAuth.api.signUpEmail({
        body: {
          email,
          password: 'AnotherValidPassword123!',
          name: 'Duplicate User',
        },
      }),
    ).rejects.toThrow();

    // 4. Wrong password rejected on sign-in
    await expect(
      testAuth.api.signInEmail({
        body: {
          email,
          password: 'IncorrectPassword999!',
        },
      }),
    ).rejects.toThrow();
  });

  it('handles HTTP requests through auth.handler at /api/auth/get-session', async () => {
    const req = new Request('http://localhost:3000/api/auth/get-session', {
      method: 'GET',
      headers: {
        origin: 'https://cashclaw.cc',
      },
    });

    const res = await testAuth.handler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });
});
