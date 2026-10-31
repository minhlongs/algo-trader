/**
 * CI guard for the shared GHSA-965c-763c-88jm reproducer core.
 *
 * The old-red/new-green reproduction guide (`tests/fixtures/better-auth-ghsa-965c/`)
 * is only trustworthy if the code it points at is actually exercised. This test
 * runs the SAME core that the CLI runner runs, on the `better-auth` version
 * pinned by this PR branch, and asserts the version really loaded matches that pin.
 *
 * A version mismatch means the fixture would be describing a build that is not
 * installed — that must fail here rather than pass silently.
 */

import { describe, it, expect } from 'vitest';
import {
  runGHSA965cReproducer,
  getLoadedBetterAuthVersion,
  PATCHED_MINIMUM_VERSION,
} from '../fixtures/better-auth-ghsa-965c/reproducer-core.ts';

const PINNED_BETTER_AUTH_MAJOR_MINOR = '1.7.7';

describe('GHSA-965c reproducer core runs against the pinned better-auth build', () => {
  it('reads the actually loaded better-auth version from the installed manifest', () => {
    expect(getLoadedBetterAuthVersion()).toBe(PINNED_BETTER_AUTH_MAJOR_MINOR);
  });

  it('blocks the OAuth-state-as-magic-link exploit with the patched build', async () => {
    const result = await runGHSA965cReproducer();

    expect(result.version).toBe(PINNED_BETTER_AUTH_MAJOR_MINOR);

    // Patched: no victim session cookie is minted.
    expect(result.exploitSucceeded).toBe(false);
    expect(result.cookieHeader).toBeNull();

    // Patched: the rejection is explicit, not an incidental transport result.
    expect(
      result.httpStatus >= 400 || result.redirectLocation?.includes('error=INVALID_TOKEN'),
    ).toBe(true);

    // Root cause of the advisory: identifiers are namespaced, so an OAuth state
    // can never be found under the `magic-link:` prefix.
    expect(result.storedIdentifiers.some((id) => id.startsWith('auth-state:'))).toBe(true);
    expect(result.storedIdentifiers.some((id) => id.startsWith('magic-link:'))).toBe(true);

    expect(result.isPatched).toBe(true);
    expect(PATCHED_MINIMUM_VERSION).toBe(PINNED_BETTER_AUTH_MAJOR_MINOR);
  });
});
