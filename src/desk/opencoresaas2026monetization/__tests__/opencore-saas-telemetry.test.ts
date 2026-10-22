// SPDX-License-Identifier: MIT
/**
 * PLG telemetry assembly — the projection must inherit the audit's safety state.
 *
 * The defect this pins down: the funnel used to type `leakedSecretsCount: 0` and
 * `licenseGateEnforced: true` at its call site, so a repository that was blocked still produced
 * an "optimal" revenue verdict. Those two values now come from the report and cannot be
 * overridden by the caller.
 */

import { describe, expect, it } from 'vitest';
import { buildPlgTelemetry } from '../../commands/opencore-saas';
import { OpenCoreSaasMonetizationCoordinator } from '../coordinator';

interface MinimalReport {
  readonly completedStepsCount: number;
  readonly blockingIssues: readonly string[];
  readonly telemetry: {
    readonly leakedSecretsCount: number;
    readonly licenseGateEnforced: boolean;
  };
}

function report(overrides: Partial<MinimalReport> = {}): MinimalReport {
  return {
    completedStepsCount: 25,
    blockingIssues: [],
    telemetry: { leakedSecretsCount: 0, licenseGateEnforced: true },
    ...overrides,
  };
}

describe('buildPlgTelemetry', () => {
  it('takes the safety inputs from the report rather than a literal', () => {
    const telemetry = buildPlgTelemetry(
      report({
        completedStepsCount: 7,
        telemetry: { leakedSecretsCount: 3, licenseGateEnforced: false },
      }),
    );

    expect(telemetry.completedRestructuringSteps).toBe(7);
    expect(telemetry.leakedSecretsCount).toBe(3);
    expect(telemetry.licenseGateEnforced).toBe(false);
  });

  it('carries the named forecast assumptions through unchanged', () => {
    const telemetry = buildPlgTelemetry(report());

    expect(telemetry.monthlyGitHubClones).toBe(12_500);
    expect(telemetry.cloudConversionRate).toBe(0.045);
  });

  it('cannot report a healthy funnel while secrets are leaking', () => {
    const telemetry = buildPlgTelemetry(
      report({ telemetry: { leakedSecretsCount: 1, licenseGateEnforced: true } }),
    );

    const verdict = OpenCoreSaasMonetizationCoordinator.evaluate(telemetry).verdict;
    expect(verdict).toBe('LEAK_OR_UNMETERED_BLOCKED');
  });

  it('cannot report a healthy funnel while the license gate is not enforced', () => {
    const telemetry = buildPlgTelemetry(
      report({ telemetry: { leakedSecretsCount: 0, licenseGateEnforced: false } }),
    );

    const verdict = OpenCoreSaasMonetizationCoordinator.evaluate(telemetry).verdict;
    expect(verdict).toBe('LEAK_OR_UNMETERED_BLOCKED');
  });
});
