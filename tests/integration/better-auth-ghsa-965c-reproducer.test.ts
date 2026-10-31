/**
 * Regression & Fix Verification Test for GHSA-965c-763c-88jm (CVE-2026-114607)
 * Advisory: "better-auth: OAuth state can be used as a Magic Link to sign in as another user"
 *
 * Affected range: >= 1.4.0-beta.18, < 1.7.7
 * Patched version: >= 1.7.7
 *
 * Production exploitability note:
 * `src/platform/auth/auth-server.ts` configures ONLY `emailAndPassword` (neither
 * `magicLink` nor social/generic OAuth providers are enabled in production).
 * Therefore production was NOT runtime-exploitable, although the pinned package
 * version (<1.7.7) triggered CI Gate 2 (`pnpm audit --audit-level=critical`).
 *
 * To verify the security fix at runtime without polluting production config,
 * this test instantiates an isolated Better Auth fixture with BOTH `magicLink`
 * and `socialProviders.github` enabled against a real database (PostgreSQL test DB
 * when available, or `@better-auth/memory-adapter` in CI). It proves:
 * 1. OAuth state values stored in `verification` are namespaced with `auth-state:`
 *    while Magic Link tokens are namespaced with `magic-link:`.
 * 2. Passing an OAuth `state` parameter (even one carrying `additionalData.email`
 *    for an existing victim account) to `/magic-link/verify` is rejected and never
 *    mints a session for the victim.
 * 3. Legitimate Magic Link tokens continue to verify and sign in the user cleanly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
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

interface VerificationRow {
  identifier: string;
  value: string;
}

describe('GHSA-965c-763c-88jm (CVE-2026-114607) Regression & Prefix Separation', () => {
  let pool: pg.Pool | null = null;
  let isPostgres = false;
  let memoryDb: {
    user: unknown[];
    session: unknown[];
    account: unknown[];
    verification: VerificationRow[];
  } = { user: [], session: [], account: [], verification: [] };
  let capturedMagicToken = '';
  let fixtureAuth: ReturnType<typeof betterAuth>;

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

    fixtureAuth = betterAuth({
      database: isPostgres && pool ? pool : memoryAdapter(memoryDb),
      secret: 'test-ghsa-965c-fixture-secret-32-chars-minimum!!',
      baseURL: 'http://localhost:3000',
      basePath: '/api/auth',
      emailAndPassword: {
        enabled: true,
      },
      socialProviders: {
        github: {
          clientId: 'test-github-client-id',
          clientSecret: 'test-github-client-secret',
        },
      },
      plugins: [
        magicLink({
          sendMagicLink: async ({ token }) => {
            capturedMagicToken = token;
          },
        }),
      ],
    });
  });

  afterAll(async () => {
    if (pool) {
      try {
        await pool.query(`DELETE FROM "user" WHERE email LIKE 'victim_%@cashclaw.cc'`);
      } catch {
        // ignore cleanup error
      }
      await pool.end().catch(() => {});
    }
  });

  it('rejects OAuth state token presented as a Magic Link token and enforces identifier prefixes', async () => {
    const victimEmail = `victim_${Date.now()}@cashclaw.cc`;

    // 1. Create the victim account
    const victimSignup = await fixtureAuth.api.signUpEmail({
      body: {
        email: victimEmail,
        password: 'VictimStrongPassword123!',
        name: 'Victim Account',
      },
    });
    expect(victimSignup.user.email).toBe(victimEmail);

    // 2. Attacker initiates OAuth sign-in injecting victim's email in additionalData
    const oauthInit = await fixtureAuth.api.signInSocial({
      headers: new Headers(),
      body: {
        provider: 'github',
        callbackURL: 'http://localhost:3000/dashboard',
        additionalData: {
          email: victimEmail,
        },
      },
    });

    expect(oauthInit.url).toBeDefined();
    const oauthState = new URL(oauthInit.url!).searchParams.get('state');
    expect(oauthState, 'OAuth sign-in must produce a state parameter').toBeTruthy();

    // 3. Also request a legitimate Magic Link for comparison of stored identifiers
    capturedMagicToken = '';
    await fixtureAuth.api.signInMagicLink({
      headers: new Headers(),
      body: {
        email: victimEmail,
      },
    });
    expect(capturedMagicToken).toBeTruthy();

    // 4. Attempt the GHSA-965c-763c-88jm exploit via HTTP handler FIRST:
    // Pass the OAuth state as the Magic Link token to /api/auth/magic-link/verify.
    // On vulnerable better-auth (<1.7.7), this mints a valid session cookie for victimEmail!
    // On patched better-auth (>=1.7.7), this rejects the token with INVALID_TOKEN and sets no cookie.
    const exploitReq = new Request(
      `http://localhost:3000/api/auth/magic-link/verify?token=${encodeURIComponent(oauthState!)}`,
      { method: 'GET' },
    );
    const exploitRes = await fixtureAuth.handler(exploitReq);

    // Must NOT set a session cookie or authenticate as the victim
    const exploitCookie = exploitRes.headers.get('set-cookie');
    expect(
      exploitCookie,
      'GHSA-965c-763c-88jm exploit succeeded: OAuth state minted a session cookie via Magic Link verify!',
    ).toBeNull();

    // If redirected, location must indicate INVALID_TOKEN error
    const redirectLocation = exploitRes.headers.get('location') || '';
    if (exploitRes.status >= 300 && exploitRes.status < 400) {
      expect(redirectLocation).toContain('error=INVALID_TOKEN');
    } else {
      expect(exploitRes.status).toBeGreaterThanOrEqual(400);
    }

    // 5. Verify stored verification identifiers use distinct `auth-state:` and `magic-link:` prefixes
    let identifiers: string[] = [];
    if (isPostgres && pool) {
      const verRes = await pool.query<VerificationRow>('SELECT identifier, value FROM verification');
      identifiers = verRes.rows.map((r) => r.identifier);
    } else {
      identifiers = memoryDb.verification.map((r) => r.identifier);
    }

    expect(identifiers.some((id) => id.startsWith('auth-state:'))).toBe(true);
    expect(identifiers.some((id) => id.startsWith('magic-link:'))).toBe(true);
    expect(identifiers).not.toContain(oauthState);
    expect(identifiers).not.toContain(capturedMagicToken);

    // 6. Confirm legitimate Magic Link token still works properly
    const legitVerify = await fixtureAuth.api.magicLinkVerify({
      headers: new Headers(),
      query: {
        token: capturedMagicToken,
      },
    });
    expect(legitVerify).toBeDefined();
    expect(legitVerify.user.email).toBe(victimEmail);
  });
});
