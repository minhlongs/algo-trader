// SPDX-License-Identifier: MIT
/**
 * Behavioral probes for the Open-Core documentation steps.
 *
 * Each step points at a document, so the honest check is the claim the document makes: the SBOM
 * is actually generated, the spec actually pins a version and documents paths, the BYOK template
 * actually documents usable keys without carrying a live credential. Each probe can return
 * `verified: false` — a claim satisfied only on paper stops the verdict, which is the point.
 *
 * @module desk/opencoresaas2026monetization/step-governance-specs
 */

import { fail, ok, readText, repoFile } from './step-governance-support';
import type { StepProbeResult } from './step-probe-types';

/**
 * Step 4 — BYOK template.
 *
 * A template with no keys teaches nothing, and one carrying a live key is a leak. Require a
 * meaningful number of documented keys and no placeholder that looks like a real credential.
 */
export function probeEnvTemplate(repoRoot: string): StepProbeResult {
  const content = readText(repoFile(repoRoot, '.env.example'));
  if (content === null) {
    return fail('.env.example is missing');
  }

  const declared = content.match(/^[A-Z][A-Z0-9_]+=/gm) ?? [];
  if (declared.length < 20) {
    return fail(`.env.example declares only ${declared.length} keys — not a usable BYOK template`);
  }

  if (/(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(content)) {
    return fail('.env.example contains what looks like a live credential');
  }

  return ok(`.env.example documents ${declared.length} keys and carries no live credential`);
}

/**
 * Step 5 — MIT license and SBOM.
 *
 * The step has two halves. MIT is real; the dependency SBOM is not, and claiming DONE on the
 * license alone is exactly the gap this probe exists to surface.
 */
export function probeLicenseAndSbom(repoRoot: string): StepProbeResult {
  const license = readText(repoFile(repoRoot, 'LICENSE'));
  if (license === null || !license.includes('MIT')) {
    return fail('LICENSE is missing or is not the MIT license');
  }

  const sbomNames = ['sbom.cdx.json', 'bom.json', 'sbom.spdx.json'];
  const hasSbom = sbomNames.some((name) => readText(repoFile(repoRoot, name)) !== null);
  if (!hasSbom) {
    return fail('MIT license is present but no dependency SBOM is generated');
  }

  return ok('MIT license present and a dependency SBOM exists');
}

/**
 * Step 10 — versioned OpenAPI spec and SDK.
 *
 * The claim is "versioned", so require a declared OpenAPI 3 version plus paths. A stub with an
 * empty `paths` block is not a published contract.
 */
export function probeOpenApiSpec(repoRoot: string): StepProbeResult {
  const content = readText(repoFile(repoRoot, 'docs/api/openapi.yaml'));
  if (content === null) {
    return fail('OpenAPI spec is missing');
  }

  const version = content.match(/^openapi:\s*(\d+\.\d+\.\d+)/m);
  if (!version) {
    return fail('OpenAPI spec does not declare a version');
  }

  const paths = content.match(/^ {2}\/[^\s:]+:/gm) ?? [];
  if (paths.length < 10) {
    return fail(`OpenAPI spec declares ${version[1]} but documents only ${paths.length} paths`);
  }

  return ok(`OpenAPI ${version[1]} spec documents ${paths.length} paths`);
}
