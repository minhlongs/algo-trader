/**
 * Strict Real PostgreSQL Integration Suite for Better Auth & Express Mounting
 *
 * CRITICAL CONTRACT:
 * - NO fallback to memoryAdapter. If PostgreSQL connection, schema migration, or
 *   SQL query fails, this suite MUST fail loudly.
 * - Enforces `assertTestDatabaseSafe` before touching the database.
 * - Cleans up ONLY the exact user IDs created during this test run.
 * - Closes the connection pool even if setup or migrations fail.
 * - Tests real Express `/api/auth` route mounting with `setupServerMiddleware`,
 *   `toNodeHandler(auth)` and the real `buildBetterAuthOptions()` + `TrialDripService`
 *   hook from `src/platform/auth/auth-server.ts` (stubbing only outbound EmailService).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Application } from 'express';
import request from 'supertest';
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import pg from 'pg';
import { up as runMigration004 } from '../../src/shared/db/migrations/004-better-auth-tables';
import { buildBetterAuthOptions } from '../../src/platform/auth/auth-server';
import {
  DEFAULT_CORS_ORIGINS,
  setupServerMiddleware,
} from '../../src/platform/api/server-middleware';
import { TrialDripService } from '../../src/platform/billing/trial-drip-service';
import { EmailService } from '../../src/platform/notifications/email-service';
import { RedisRateLimiter } from '../../src/forest/rate-limit/redis-rate-limiter';
import {
  assertTestDatabaseSafe,
  createScopedCleanupTracker,
} from '../helpers/test-db-safety-guard';

const TEST_DB_NAME = 'algo_trader_test_auth';
const TEST_PG_CONFIG: pg.PoolConfig = {
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
  database: process.env.TEST_DB_NAME || TEST_DB_NAME,
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || '',
  max: 4,
};

// Skip ONLY if running in a headless CI runner without PostgreSQL service and STRICT_PG_TEST is not set.
// When STRICT_PG_TEST=true or local Postgres is targeted, it runs strictly with 0 fallback.
const shouldRunStrictPg =
  process.env.STRICT_PG_TEST === 'true' || process.env.CI !== 'true';

describe.runIf(shouldRunStrictPg)(
  'Strict Real PostgreSQL Better Auth & Express Integration (No Memory Fallback)',
  () => {
    let pool: pg.Pool | null = null;
    let pgAuth: ReturnType<typeof betterAuth>;
    let app: Application;
    const cleanupTracker = createScopedCleanupTracker();
    const runId = `pg_run_${Date.now()}`;

    beforeAll(async () => {
      // 1. Fail-closed DB safety check BEFORE creating pool or migrating
      assertTestDatabaseSafe(TEST_PG_CONFIG);

      const candidatePool = new pg.Pool(TEST_PG_CONFIG);
      try {
        const client = await candidatePool.connect();
        try {
          // Verify actual connected database name at runtime
          const dbRes = await client.query<{ current_database: string }>(
            'SELECT current_database()',
          );
          const actualDb = dbRes.rows[0]?.current_database;
          assertTestDatabaseSafe({ database: actualDb });

          await runMigration004(client);
          pool = candidatePool;
        } finally {
          client.release();
        }
      } catch (err) {
        await candidatePool.end().catch(() => {});
        throw err;
      }

      // Stub outbound EmailService so no real emails are ever sent
      vi.spyOn(EmailService.prototype, 'send').mockResolvedValue(true);

      // Fast-path Redis rate limiter in tests without running redis daemon
      vi.spyOn(RedisRateLimiter.prototype, 'checkRateLimit').mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetAt: new Date(Date.now() + 60000),
      });

      // Instantiate Better Auth using the REAL application builder & hook from src/platform/auth/auth-server.ts
      // Better Auth disables origin check in test runner (isTest() === true) by default.
      // Explicitly pass `disableOriginCheck: false` to enforce production origin validation under tests.
      pgAuth = betterAuth(
        buildBetterAuthOptions({
          database: pool,
          secret: 'strict-pg-test-secret-minimum-32-characters!!',
          baseURL: 'http://localhost:3000',
          advanced: {
            disableOriginCheck: false,
          },
        }),
      );

      // Mount on real Express application with application middleware matching src/platform/api/server.ts
      app = express();
      setupServerMiddleware(app, DEFAULT_CORS_ORIGINS);
      const authHandler = toNodeHandler(pgAuth);
      app.use('/api/auth', (req, res) => {
        authHandler(req, res);
      });
    });

    afterAll(async () => {
      // Clean up in-memory TrialDripService singleton subscriber
      try {
        const userIds = cleanupTracker.getUserIds();
        for (const uid of userIds) {
          TrialDripService.getInstance().unsubscribe(uid);
        }
      } catch {
        // ignore in-memory cleanup errors
      }

      if (pool) {
        try {
          const userIds = cleanupTracker.getUserIds();
          if (userIds.length > 0) {
            await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
              userIds,
            ]);
          }
        } finally {
          await pool.end().catch(() => {});
        }
      }
      vi.restoreAllMocks();
    });

    it('rejects unsafe database configuration immediately before any connection or migration', () => {
      expect(() =>
        assertTestDatabaseSafe({
          ...TEST_PG_CONFIG,
          database: 'algo_trader',
        }),
      ).toThrow(/REJECTED UNSAFE DATABASE/);
    });

    it('executes full Express HTTP lifecycle (/api/auth/*) against real PostgreSQL and triggers real TrialDripService hook', async () => {
      if (!pool) throw new Error('PostgreSQL pool not initialized');

      const testEmail = `pg_expr_${runId}@cashclaw.cc`;
      const testPassword = 'StrongPgPassword123!';
      const subscribeSpy = vi.spyOn(TrialDripService.getInstance(), 'subscribe');

      // 1. Sign up via Express POST /api/auth/sign-up/email
      const signUpRes = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', 'https://cashclaw.cc')
        .set('Content-Type', 'application/json')
        .send({
          email: testEmail,
          password: testPassword,
          name: 'Strict PG Trader',
        });

      expect(signUpRes.status).toBe(200);
      expect(signUpRes.body.user).toBeDefined();
      expect(signUpRes.body.user.email).toBe(testEmail);
      const userId: string = signUpRes.body.user.id;
      cleanupTracker.trackUserId(userId);

      // Verify the application's real TrialDripService hook from auth-server.ts was invoked
      expect(subscribeSpy).toHaveBeenCalledWith(testEmail, userId, 'FREE', 7);
      const dripSub = TrialDripService.getInstance().getSubscriber(userId);
      expect(dripSub?.email).toBe(testEmail);

      // Extract session cookie
      const rawCookies = signUpRes.headers['set-cookie'];
      expect(rawCookies).toBeDefined();
      const cookieArray = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
      const cookieHeader = cookieArray.map((c: string) => c.split(';')[0]).join('; ');

      // 2. Verify SQL persistence in PostgreSQL tables ("user", "account", "session")
      const dbUser = await pool.query(
        'SELECT id, email, name FROM "user" WHERE id = $1',
        [userId],
      );
      expect(dbUser.rows).toHaveLength(1);
      expect(dbUser.rows[0].email).toBe(testEmail);

      const dbAccount = await pool.query(
        'SELECT "providerId", "userId" FROM account WHERE "userId" = $1',
        [userId],
      );
      expect(dbAccount.rows).toHaveLength(1);
      expect(dbAccount.rows[0].providerId).toBe('credential');

      const dbSession = await pool.query(
        'SELECT id, "userId", token FROM session WHERE "userId" = $1',
        [userId],
      );
      expect(dbSession.rows).toHaveLength(1);
      cleanupTracker.trackSessionId(dbSession.rows[0].id);

      // 3. Retrieve session via Express GET /api/auth/get-session
      const getSessionRes = await request(app)
        .get('/api/auth/get-session')
        .set('Origin', 'https://cashclaw.cc')
        .set('Cookie', cookieHeader);

      expect(getSessionRes.status).toBe(200);
      expect(getSessionRes.body?.user?.id).toBe(userId);

      // 4. Reject sign-in with wrong password via Express POST /api/auth/sign-in/email
      const wrongPassRes = await request(app)
        .post('/api/auth/sign-in/email')
        .set('Origin', 'https://cashclaw.cc')
        .set('Content-Type', 'application/json')
        .send({
          email: testEmail,
          password: 'WrongPassword999!',
        });
      expect(wrongPassRes.status).toBe(401);

      // 5. Reject forbidden / untrusted Origin on state-changing POST /api/auth/sign-in/email
      const forbiddenOriginRes = await request(app)
        .post('/api/auth/sign-in/email')
        .set('Origin', 'https://evil-attacker.example.com')
        .set('Content-Type', 'application/json')
        .send({
          email: testEmail,
          password: testPassword,
        });
      expect(forbiddenOriginRes.status).toBe(403);
      expect(forbiddenOriginRes.body?.code).toBe('INVALID_ORIGIN');
      expect(forbiddenOriginRes.headers['access-control-allow-origin']).toBeUndefined();

      // 6. Sign out via Express POST /api/auth/sign-out and verify DB revocation
      const signOutRes = await request(app)
        .post('/api/auth/sign-out')
        .set('Origin', 'https://cashclaw.cc')
        .set('Cookie', cookieHeader);
      expect(signOutRes.status).toBe(200);

      // Verify PostgreSQL session row was deleted immediately
      const revokedSession = await pool.query(
        'SELECT id FROM session WHERE "userId" = $1',
        [userId],
      );
      expect(revokedSession.rows).toHaveLength(0);

      // Verify sign-out clears the cookies (Max-Age=0)
      const signOutCookies = signOutRes.headers['set-cookie'];
      expect(signOutCookies).toBeDefined();
      const clearedCookieHeader = (Array.isArray(signOutCookies) ? signOutCookies : [signOutCookies])
        .map((c: string) => c.split(';')[0])
        .join('; ');

      const postSignOutSession = await request(app)
        .get('/api/auth/get-session')
        .set('Origin', 'https://cashclaw.cc')
        .set('Cookie', clearedCookieHeader);
      expect(postSignOutSession.body).toBeNull();

      // 7. Sign back in via Express POST /api/auth/sign-in/email with valid credentials
      const signInRes = await request(app)
        .post('/api/auth/sign-in/email')
        .set('Origin', 'https://cashclaw.cc')
        .set('Content-Type', 'application/json')
        .send({
          email: testEmail,
          password: testPassword,
        });
      expect(signInRes.status).toBe(200);
      expect(signInRes.body?.user?.id).toBe(userId);
      expect(signInRes.headers['set-cookie']).toBeDefined();
    });
  },
);
