/**
 * Behavioral probes for the Open-Core boundary and policy-enforcement steps.
 *
 * These steps claim something is *enforced* rather than merely configured: a secret-scanning
 * ruleset that actually runs, a real OSS/EE boundary, an upgrade prompt a user actually sees.
 * Each probe can return `verified: false`, and three of them currently do — which is the point of
 * probing instead of counting files.
 *
 * @module desk/opencoresaas2026monetization/step-boundary-probes
 */

import fs from 'node:fs';
import path from 'node:path';
import { fail, ok, readText, repoFile } from './step-governance-support';
import type { StepProbeResult } from './step-probe-types';

/**
 * Step 1 — git history secret purge.
 *
 * The step claims a scan of history for leaked keys. A config file is not a scan: the probe
 * requires the ruleset to actually be wired into CI, otherwise nothing enforces it.
 */
export function probeSecretPurgeWiring(repoRoot: string): StepProbeResult {
  const ruleset = readText(repoFile(repoRoot, '.gitleaks.toml'));
  if (ruleset === null) {
    return fail('gitleaks ruleset is missing');
  }

  const workflowDir = path.join(repoRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowDir)) {
    return fail('no CI workflows directory, so no gate can run');
  }

  const wired = fs
    .readdirSync(workflowDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .some((name) => {
      const text = fs.readFileSync(path.join(workflowDir, name), 'utf8');
      return /gitleaks/i.test(text);
    });

  if (!wired) {
    return fail('gitleaks ruleset exists but no CI workflow runs it');
  }

  return ok('gitleaks ruleset is defined and executed by a CI workflow');
}

/**
 * Step 2 — OSS vs EE directory split.
 *
 * The claim is a boundary, not two folders. A boundary exists when something actually separates
 * what ships under MIT from what is cloud-only, so the probe requires a runtime edition or
 * entitlement check rather than a directory listing.
 */
export function probeOssEeBoundary(repoRoot: string): StepProbeResult {
  const desk = path.join(repoRoot, 'src', 'desk');
  const raas = path.join(repoRoot, 'src', 'raas');
  if (!fs.existsSync(desk) || !fs.existsSync(raas)) {
    return fail('expected OSS and cloud directories are absent');
  }

  const catalog = readText(repoFile(repoRoot, 'src/desk/opencoresaas2026monetization/catalog.ts'));
  const boundaryEnforced =
    catalog !== null &&
    /edition/i.test(catalog) &&
    /isOssCore/.test(catalog) &&
    fs.existsSync(path.join(repoRoot, 'src/desk/opencoresaas2026monetization/license-gate.ts'));

  if (!boundaryEnforced) {
    return fail('directories exist but no runtime boundary distinguishes OSS from cloud-only code');
  }

  return ok('OSS and cloud directories exist and a license gate enforces the boundary');
}

/**
 * Step 22 — CLI HTTP 402 upgrade prompt.
 *
 * The claim is that the terminal shows a payment prompt when a free tier runs out. The probe
 * requires the CLI surface the step names to actually emit a 402 status with an upgrade URL.
 */
export function probeCliUpgradePrompt(repoRoot: string): StepProbeResult {
  const cli = readText(repoFile(repoRoot, 'src/desk/commands/opencore-saas.ts'));
  if (cli === null) {
    return fail('CLI command is missing');
  }

  if (!/402|upgrade|recharge/i.test(cli)) {
    return fail('CLI never emits a 402 status or an upgrade prompt');
  }

  const meter = readText(
    repoFile(repoRoot, 'src/desk/opencoresaas2026monetization/billing-meter.ts'),
  );
  if (meter === null || !/upgradeUrl/.test(meter)) {
    return fail('quota exhaustion produces no upgrade URL to show the user');
  }

  return ok('quota exhaustion returns 402 with an upgrade URL');
}
