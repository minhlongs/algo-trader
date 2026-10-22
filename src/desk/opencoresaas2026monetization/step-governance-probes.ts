// SPDX-License-Identifier: MIT
/**
 * Behavioral probes for the Open-Core policy gates.
 *
 * These are the steps whose claim is a *lock* or a *governance rule*: the quarantine, the CI gate
 * and the CLA. The honest check is enforcement, not the presence of a configuration file — a
 * `.gitignore` that omits `*.pem` or a CI step that only warns satisfies the file but not the
 * claim. Each probe can return `verified: false`, which is what makes it evidence.
 *
 * @module desk/opencoresaas2026monetization/step-governance-probes
 */

import { fail, ok, readText, repoFile } from './step-governance-support';
import type { StepProbeResult } from './step-probe-types';

/**
 * Step 3 — quarantine lock.
 *
 * The step is named "lock", so a plain `.env` line is not enough: a certificate (`*.pem`) or a
 * wallet seed left unignored would land in a public repo, which is exactly what the lock exists
 * to prevent. The check is semantic rather than one literal spelling, so `.env` and `*.env*` both
 * count as env coverage while neither covers PEM keys.
 */
export function probeQuarantineLock(repoRoot: string): StepProbeResult {
  const content = readText(repoFile(repoRoot, '.gitignore'));
  if (content === null) {
    return fail('.gitignore is missing');
  }

  const quarantinesEnv = /^\*?\.env(\*)?$/m.test(content) || /^\*\.env/m.test(content);
  const quarantinesPem = /\*\.pem/.test(content);
  const quarantinesKeyMaterial = /(wallet|keystore|id_rsa|private[_-]?key)/i.test(content);

  const missing: string[] = [];
  if (!quarantinesEnv) missing.push('environment files (.env)');
  if (!quarantinesPem) missing.push('PEM private keys (*.pem)');
  if (!quarantinesKeyMaterial) missing.push('wallet seeds / keystores');

  if (missing.length > 0) {
    return fail(`.gitignore does not quarantine ${missing.join(', ')}`);
  }

  return ok('.gitignore quarantines env files, PEM private keys and wallet material');
}

/**
 * Step 23 — CI leak and LOC gate.
 *
 * The step promises enforcement. A `::warning::` step publishes anyway, so the probe requires the
 * LOC check to actually fail the job — the soft cap is precisely the defect this step names.
 */
export function probeCiEnforcement(repoRoot: string): StepProbeResult {
  const workflow = readText(repoFile(repoRoot, '.github/workflows/ci.yml'));
  if (workflow === null) {
    return fail('ci.yml is missing');
  }

  if (/::warning::Files exceed/.test(workflow)) {
    return fail('LOC policy only warns (::warning::) — it does not block the build');
  }
  if (/exit 0/.test(workflow)) {
    return fail('LOC gate exits 0, so oversized files pass');
  }

  return ok('CI fails the job when a file exceeds the LOC cap');
}

/**
 * Step 25 — CLA and dual-license governance.
 *
 * Require the CLA to be a real agreement rather than a heading: the governing grant language has
 * to be present, and the repository needs a license for the CLA to grant rights under.
 */
export function probeClaGovernance(repoRoot: string): StepProbeResult {
  const cla = readText(repoFile(repoRoot, 'CLA.md'));
  if (cla === null) {
    return fail('CLA.md is missing');
  }

  if (!/license|licence/i.test(cla)) {
    return fail('CLA.md does not state a license grant');
  }

  const license = readText(repoFile(repoRoot, 'LICENSE'));
  if (license === null) {
    return fail('LICENSE is missing, so the CLA grants rights under nothing');
  }

  return ok('CLA states a license grant and a repository LICENSE backs it');
}

/** The policy gates, re-exported as one surface for the probe registry. */
export {
  probeEnvTemplate,
  probeLicenseAndSbom,
  probeOpenApiSpec,
} from './step-governance-specs';
export { probeBacktestLeaderboard, probeQuickstart } from './step-governance-public';
