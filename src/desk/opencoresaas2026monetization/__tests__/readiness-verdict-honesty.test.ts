/**
 * Verdict honesty — existence must never outrun behavior.
 *
 * These tests pin the invariant that made the old auditor misleading: it reported
 * `isReadyForPublicGithub: true` from `fs.existsSync` alone. Both directions are covered, because
 * a gate that cannot go red is the same defect in a new place.
 */

import { describe, expect, it } from 'vitest';
import { OpenCoreReadinessAuditor } from '../readiness-auditor';

const clean = {
  completedSteps: 25,
  leakedSecretsCount: 0,
  licenseGateEnforced: true,
  quotaMeteringEnforced: true,
  protectedFlowsIntact: true,
};

describe('behavioral blocking notes', () => {
  it('fails the verdict when a behavioral note is supplied', () => {
    const report = new OpenCoreReadinessAuditor().audit({
      ...clean,
      behavioralBlockingNotes: ['23 of 25 steps are existence-verified only'],
    });

    expect(report.isReadyForPublicGithub).toBe(false);
    expect(report.blockingIssues).toContain('23 of 25 steps are existence-verified only');
  });

  it('stays green when there is nothing to block and every flag holds', () => {
    const report = new OpenCoreReadinessAuditor().audit(clean);

    expect(report.blockingIssues).toHaveLength(0);
    expect(report.isReadyForPublicGithub).toBe(true);
  });

  it('still fails the verdict when a pre-existing flag is false', () => {
    const report = new OpenCoreReadinessAuditor().audit({
      ...clean,
      licenseGateEnforced: false,
    });

    expect(report.isReadyForPublicGithub).toBe(false);
    expect(report.blockingIssues.length).toBeGreaterThan(0);
  });
});
