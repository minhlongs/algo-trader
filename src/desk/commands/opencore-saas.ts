// SPDX-License-Identifier: MIT
/**
 * CLI Command: Open-Core 25-Step Architecture & SaaS Readiness
 * Interactive CLI runner inspecting 25 steps, audit status, and PLG monetization.
 *
 * @module desk/commands/opencore-saas
 */

import path from 'node:path';
import { logger } from '../../shared/utils/logger';
import { OPEN_CORE_25_STEPS } from '../opencoresaas2026monetization/catalog';
import { RepositoryBlueprintAuditor } from '../opencoresaas2026monetization/repository-blueprint-auditor';
import { OpenCoreSaasMonetizationCoordinator } from '../opencoresaas2026monetization/coordinator';
import type { OpenCoreSaaSTelemetry } from '../opencoresaas2026monetization/types';

export interface OpenCoreSaasCommandOptions {
  steps?: boolean;
  audit?: boolean;
  funnel?: boolean;
  stepNumber?: number;
  repoRoot?: string;
}

/**
 * Planning inputs for the PLG projection. None of these are observations.
 *
 * `SAAS_TARGET_METRICS` are the founder's stated 2026 assumptions, not measurement — the repo has
 * no live conversion telemetry to read. They exist here, named, so the funnel can say which
 * numbers are assumptions; they must never be presented as an achieved result. The safety and
 * completion inputs the verdict depends on (`leakedSecretsCount`, `licenseGateEnforced`,
 * `completedRestructuringSteps`) are deliberately absent and are supplied from the live audit
 * instead, so a failing repo cannot report a healthy funnel.
 */
const SAAS_TARGET_METRICS = {
  monthlyGitHubClones: 12_500,
  activeCliDevelopers: 2_400,
  cloudConversionRate: 0.045,
  avgMonthlyMcuSpendUsd: 145,
  enterpriseSeatsCount: 28,
  enterpriseSeatPriceUsd: 1_250,
} as const;

/**
 * Build PLG telemetry from a live audit report plus the named assumptions.
 *
 * The three fields the verdict's safety depends on come from the report, never from a literal —
 * that is what keeps a blocked repository from producing a healthy projection. Callers cannot
 * override them, so the mapping from measured state to verdict stays in one readable place.
 */
export function buildPlgTelemetry(report: {
  readonly completedStepsCount: number;
  readonly telemetry: { readonly leakedSecretsCount: number; readonly licenseGateEnforced: boolean };
}): OpenCoreSaaSTelemetry {
  return {
    completedRestructuringSteps: report.completedStepsCount,
    ...SAAS_TARGET_METRICS,
    leakedSecretsCount: report.telemetry.leakedSecretsCount,
    licenseGateEnforced: report.telemetry.licenseGateEnforced,
  };
}

export async function runOpenCoreSaasCommand(options: OpenCoreSaasCommandOptions = {}): Promise<void> {
  logger.info('\n🚀 25-Step Open-Core Public GitHub + SaaS Architecture (`--deep`)\n');
  logger.info('================================================================');

  if (options.steps !== false && !options.audit && !options.funnel) {
    logger.info('📋 25-STEP OPEN-CORE ARCHITECTURAL BLUEPRINT (5 PHASES):\n');
    let currentPhase = '';
    for (const step of OPEN_CORE_25_STEPS) {
      if (options.stepNumber && step.stepNumber !== options.stepNumber) continue;
      if (step.phase !== currentPhase) {
        currentPhase = step.phase;
        logger.info(`\n🔸 [${currentPhase}]`);
      }
      logger.info(`  Step ${step.stepNumber.toString().padStart(2, '0')}: ${step.name}`);
      logger.info(`    - Module: ${step.targetModule} | Min Tier: ${step.minTier} | OSS Core: ${step.isOssCore ? 'YES (MIT)' : 'NO (RaaS)'}`);
      logger.info(`    - EN: ${step.descriptionEn}`);
      logger.info(`    - VI: ${step.descriptionVi}`);
    }
  }

  if (options.audit) {
    logger.info('\n🛡️ RUNNING LIVE REPOSITORY READINESS & SECRET LEAK AUDIT...\n');
    const repoRoot = options.repoRoot ?? path.resolve(__dirname, '../../../');
    const repoAuditor = new RepositoryBlueprintAuditor();
    const liveAudit = await repoAuditor.auditRepository(repoRoot);
    const report = liveAudit.readinessReport;

    logger.info(`Status: ${report.isReadyForPublicGithub ? '✅ READY FOR PUBLIC GITHUB' : '❌ BLOCKED'}`);
    logger.info(`Completed Steps: ${report.completedStepsCount}/${report.totalSteps} (${report.readinessPercentage}%)`);
    logger.info(`Blueprint Tree HMAC-SHA256: ${liveAudit.blueprintTreeDigestSha256}`);
    logger.info(`OSS Governance Intact: ${liveAudit.governanceFilesIntact ? 'YES' : 'NO'} | Polar Blocked: ${liveAudit.polarBlockedInCompanyConfig ? 'YES' : 'NO'}`);

    if (report.blockingIssues.length > 0) {
      logger.info('\nBlocking Issues:');
      for (const issue of report.blockingIssues) {
        logger.info(`  ⚠️ ${issue}`);
      }
    } else {
      logger.info(
        'No blocking issues reported. Note: license-gate, quota and hygiene checks verify that the ' +
          'expected files are present, not that they enforce their rules — see step behavior probes.',
      );
    }
  }

  if (options.funnel) {
    logger.info('\n📈 PLG PROJECTION — FORECAST, NOT MEASURED RESULT\n');
    logger.info('   Conversion and revenue inputs are founder assumptions (SAAS_TARGET_METRICS).');
    logger.info('   Safety inputs are read from the live audit below.\n');

    const repoRoot = options.repoRoot ?? path.resolve(__dirname, '../../../');
    const liveAudit = await new RepositoryBlueprintAuditor().auditRepository(repoRoot);
    const report = liveAudit.readinessReport;
    const blockingCount = report.blockingIssues.length;

    logger.info(`   Live audit: ${report.completedStepsCount}/${report.totalSteps} steps, ${blockingCount} blocking issue(s).`);

    const result = OpenCoreSaasMonetizationCoordinator.evaluate(buildPlgTelemetry(report));

    if (blockingCount > 0) {
      logger.info(`Verdict: ${result.verdict} — projection is invalid while the audit is blocked.`);
    } else {
      logger.info(`Verdict: ${result.verdict}`);
    }
    logger.info(`ARR Projection: $${result.totalProjectedArrUsd.toLocaleString()}`);
    logger.info(`Paid Cloud Subscribers: ${result.paidCloudSubscribers} cloud subscribers`);
    logger.info(`Monthly PLG MCU ARR: $${result.monthlyPlgMcuArrUsd.toLocaleString()}`);
    logger.info(`Enterprise RBAC ARR: $${result.enterpriseRbacArrUsd.toLocaleString()}`);
  }

  logger.info('\n================================================================\n');
}
