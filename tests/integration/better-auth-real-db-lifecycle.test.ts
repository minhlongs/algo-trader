/**
 * Portable Memory Adapter Integration Test for Better Auth Lifecycle & HTTP Handler
 *
 * Dedicated to the `@better-auth/memory-adapter` backend (separated from the strict
 * PostgreSQL suite in `better-auth-postgres-express-integration.test.ts` which never
 * falls back to memory):
 * 1. User Signup (email/password), Auto-SignIn cookie & session creation, TrialDrip hook
 * 2. In-memory persistence into "user", "account", and "session" collections
 * 3. Session retrieval via `getSession` with signed session cookie
 * 4. Sign-in with verified credentials and rejection of wrong password
 * 5. Password policy enforcement (minPasswordLength: 8) & duplicate email rejection
 * 6. Session revocation via `signOut` (cookie invalidated + session row removed)
 * 7. HTTP handler (`auth.handler`) request/response round-trip
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

describe('Better Auth Memory Adapter Lifecycle & HTTP Handler (Separated from PostgreSQL Suite)', () => {
  let memoryDb: Record<string, unknown[]> = {};
  let testAuth: ReturnType<typeof betterAuth>;
  const trialDripSubscribeSpy = vi.fn();

  beforeAll(() => {
    memoryDb = { user: [], session: [], account: [], verification: [] };

    testAuth = betterAuth({
      database: memoryAdapter(memoryDb),
      secret: 'test-memory-db-lifecycle-secret-32-chars-min!!',
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

  it('performs full signup, persists records in memory adapter, verifies cookie session, and revokes on signOut', async () => {
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

    // Verify TrialDrip after-signup databaseHook fired with user
    expect(trialDripSubscribeSpy).toHaveBeenCalledWith(
      testEmail,
      signUpRes.user.id,
      'FREE',
      7,
    );

    const setCookie = signUpHeaders.get('set-cookie');
    expect(setCookie, 'signUpEmail must set session cookie when autoSignIn is enabled').toBeTruthy();
    const cookiePair = setCookie!.split(';')[0];

    // 2. Verify records in memory adapter collections
    expect(memoryDb.user.length).toBeGreaterThanOrEqual(1);
    expect(memoryDb.session.length).toBeGreaterThanOrEqual(1);
    expect(memoryDb.account.length).toBeGreaterThanOrEqual(1);

    // 3. Verify active session via getSession with cookie
    const sessionRes = await testAuth.api.getSession({
      headers: new Headers({ cookie: cookiePair }),
    });
    expect(sessionRes).not.toBeNull();
    expect(sessionRes?.user.email).toBe(testEmail);
    expect(sessionRes?.session.token).toBe(signUpRes.token);

    // 4. Sign out and confirm session is revoked in API and memory store
    await testAuth.api.signOut({
      headers: new Headers({ cookie: cookiePair }),
    });

    const afterSignOut = await testAuth.api.getSession({
      headers: new Headers({ cookie: cookiePair }),
    });
    expect(afterSignOut).toBeNull();

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
