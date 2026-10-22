// SPDX-License-Identifier: MIT
/**
 * Shared file readers for the Open-Core governance probes.
 *
 * Both probe modules report against the claim a document makes, so they share the same
 * read-and-report helpers. Keeping them in one place stops the two halves drifting apart in what
 * they treat as a missing or falsified claim.
 *
 * @module desk/opencoresaas2026monetization/step-governance-support
 */

import fs from 'node:fs';
import path from 'node:path';
import type { StepProbeResult } from './step-probe-types';

/** A verified claim. `evidence` is surfaced in the audit so a reviewer can see the basis. */
export function ok(evidence: string): StepProbeResult {
  return { verified: true, evidence, kind: 'behavioral' };
}

/** A falsified or unsatisfied claim. */
export function fail(evidence: string): StepProbeResult {
  return { verified: false, evidence, kind: 'behavioral' };
}

/** Read a file as text, or null when it is absent so callers can name the missing artifact. */
export function readText(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

/** Resolve a repository-relative path for a probe. */
export function repoFile(repoRoot: string, relative: string): string {
  return path.join(repoRoot, relative);
}
