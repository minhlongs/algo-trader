/**
 * Shared CLI runner for the GHSA-965c-763c-88jm reproducer.
 *
 * The OLD-RED (vulnerable `better-auth@1.6.29`) and NEW-GREEN (patched
 * `better-auth@1.7.7`) reproductions MUST go through this one entry point so both
 * exercise identical setup and assertion logic against whatever build is loaded.
 * The runner reads the loaded package version and refuses to print a PASS verdict
 * for a build that is not in the patched range.
 *
 * Usage (from the fixture directory, after installing the target version):
 *   tsx run-reproducer.ts                 # run against the loaded build
 *   tsx run-reproducer.ts --expect <ver>  # additionally require the loaded
 *                                         # version to match, else exit 3
 *
 * Exit codes:
 *   0 — build is patched (no cookie, explicit rejection, namespaced identifiers)
 *   1 — build is vulnerable (a cookie was minted) or the rejection signal is absent
 *   2 — setup error (reproducer could not run to completion)
 *   3 — loaded version did not match --expect
 */

import {
  runGHSA965cReproducer,
  getLoadedBetterAuthVersion,
  PATCHED_MINIMUM_VERSION,
} from './reproducer-core';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const expectIndex = args.indexOf('--expect');
  const expectedVersion = expectIndex >= 0 ? args[expectIndex + 1] : null;

  const loadedVersion = getLoadedBetterAuthVersion();
  console.log(`[Reproducer] Loaded better-auth version: ${loadedVersion}`);

  if (expectedVersion && loadedVersion !== expectedVersion) {
    console.error(
      `[Reproducer] VERSION MISMATCH: expected "${expectedVersion}" but loaded "${loadedVersion}". ` +
        'Refusing to report a result for a build that is not the intended one.',
    );
    return 3;
  }

  let result;
  try {
    result = await runGHSA965cReproducer();
  } catch (err) {
    console.error(`[Reproducer] SETUP ERROR (not the vulnerability): ${(err as Error).message}`);
    return 2;
  }

  console.log(`[Reproducer] Reporting version: ${result.version}`);
  console.log(`[Reproducer] HTTP status: ${result.httpStatus}`);
  console.log(`[Reproducer] Set-Cookie: ${result.cookieHeader ?? 'null'}`);
  console.log(`[Reproducer] Redirect location: ${result.redirectLocation ?? 'null'}`);
  console.log(`[Reproducer] Stored identifiers: ${JSON.stringify(result.storedIdentifiers)}`);

  if (result.exploitSucceeded) {
    console.log(
      `🔴 EXPLOIT SUCCESSFUL (Vulnerable build ${result.version} < ${PATCHED_MINIMUM_VERSION}): ` +
        'OAuth state minted a victim session cookie via Magic Link verify.',
    );
    return 1;
  }

  if (!result.isPatched) {
    console.log(
      `🟡 REJECTED WITHOUT PATCH EVIDENCE on ${result.version}: ` +
        `exploit blocked, but patched build markers absent ` +
        `(status=${result.httpStatus}, redirect=${result.redirectLocation ?? 'none'}). ` +
        'This is not a green result.',
    );
    return 1;
  }

  console.log(
    `🟢 EXPLOIT BLOCKED (Patched build ${result.version} >= ${PATCHED_MINIMUM_VERSION}): ` +
      'no cookie, explicit rejection, namespaced verification identifiers.',
  );
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(`[Reproducer] SETUP ERROR: ${(err as Error).message}`);
    process.exit(2);
  });
