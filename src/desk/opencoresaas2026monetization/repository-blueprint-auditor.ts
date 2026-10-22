// SPDX-License-Identifier: MIT
/**
 * Live Repository & Cryptographic Tree Auditor for the 25-Step Open-Core Blueprint
 * Verifies on-disk target modules, OSS governance files, billing policies, and tree HMAC.
 *
 * @module desk/opencoresaas2026monetization/repository-blueprint-auditor
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { OPEN_CORE_25_STEPS } from './catalog';
import { OpenCoreReadinessAuditor } from './readiness-auditor';
import {
  checkTargetModuleExistsOnDisk,
  evaluateQuarantineAndBillingFiles,
  REQUIRED_GOVERNANCE_FILES,
  type LiveRepositoryBlueprintAudit,
  type StepBehaviorAuditEntry,
} from './repository-blueprint-helpers';
import { probeStep } from './step-behavior-probes';

export * from './repository-blueprint-helpers';

/** Steps whose behavioral probe is authoritative for a readiness gate. */
const LICENSE_GATE_STEP_ID = 'hmac-jwt-license-gate';
const MCU_METERING_STEP_ID = 'mcu-and-quota-metering';

export class RepositoryBlueprintAuditor {
  private readonly secretSalt: string;

  constructor(secretSalt = 'algo-trader-opencore-tree-salt-2026') {
    this.secretSalt = secretSalt;
  }

  async auditRepository(repoRoot: string): Promise<LiveRepositoryBlueprintAudit> {
    const missingStepModules: string[] = [];
    const hash = crypto.createHmac('sha256', this.secretSalt);

    for (const step of OPEN_CORE_25_STEPS) {
      const exists = checkTargetModuleExistsOnDisk(repoRoot, step.targetModule);
      if (!exists) {
        missingStepModules.push(`Step ${step.stepNumber} (${step.id}): ${step.targetModule}`);
      }
      hash.update(`${step.stepNumber}:${step.id}:${step.targetModule}:${exists ? '1' : '0'}\n`);
    }

    // Existence proves a path was committed; the probes exercise the behavior the step promises.
    // The two are reported separately so a green existence count cannot stand in for enforcement.
    const stepBehaviorAudit: StepBehaviorAuditEntry[] = [];
    for (const step of OPEN_CORE_25_STEPS) {
      const result = await probeStep(step.id, repoRoot);
      stepBehaviorAudit.push({
        stepId: step.id,
        stepNumber: step.stepNumber,
        verified: result.verified,
        kind: result.kind,
        evidence: result.evidence,
      });
    }
    const behaviorallyVerifiedCount = stepBehaviorAudit.filter((e) => e.verified).length;
    const existenceOnlyStepCount = stepBehaviorAudit.filter((e) => !e.verified).length;

    const missingGovernanceFiles: string[] = [];
    for (const govFile of REQUIRED_GOVERNANCE_FILES) {
      const exists = fs.existsSync(path.join(repoRoot, govFile));
      if (!exists) {
        missingGovernanceFiles.push(govFile);
      }
      hash.update(`gov:${govFile}:${exists ? '1' : '0'}\n`);
    }

    const {
      gitignoreQuarantineIntact,
      npmignoreQuarantineIntact,
      polarBlockedInCompanyConfig,
      companyRawLength,
    } = evaluateQuarantineAndBillingFiles(repoRoot);

    if (companyRawLength > 0) {
      hash.update(`company:${companyRawLength}\n`);
    }

    const verifiedStepModulesCount = OPEN_CORE_25_STEPS.length - missingStepModules.length;
    const leakedSecretsCount = gitignoreQuarantineIntact && npmignoreQuarantineIntact ? 0 : 1;
    // These two gate the verdict, so they must report what the code does, not that a file ships.
    // The probes exercise the HMAC gate and the 402 meter; a probe that cannot fail reports absent
    // and is treated as not enforced.
    const licenseGateEnforced = stepBehaviorAudit.find((e) => e.stepId === LICENSE_GATE_STEP_ID)?.verified === true;
    const quotaMeteringEnforced = stepBehaviorAudit.find((e) => e.stepId === MCU_METERING_STEP_ID)?.verified === true;
    const protectedFlowsIntact =
      polarBlockedInCompanyConfig && missingGovernanceFiles.length === 0;

    // Readiness must not outrun verification. Existence alone cannot satisfy the gates, so these
    // notes are built before the auditor runs — a green verdict that ignores them is the hole
    // this phase closes. A failing probe, or a step with no behavioral probe at all, blocks.
    const blockingNotes: string[] = [];
    for (const entry of stepBehaviorAudit) {
      if (entry.kind === 'behavioral' && !entry.verified) {
        blockingNotes.push(
          `Step ${entry.stepNumber} (${entry.stepId}) failed behavioral probe: ${entry.evidence}`,
        );
      }
    }
    if (existenceOnlyStepCount > 0) {
      blockingNotes.push(
        `${existenceOnlyStepCount} of ${stepBehaviorAudit.length} steps are existence-verified only ` +
          'and cannot support a public-release claim.',
      );
    }

    const readinessAuditor = new OpenCoreReadinessAuditor();
    const readinessReport = readinessAuditor.audit({
      completedSteps: verifiedStepModulesCount,
      leakedSecretsCount,
      licenseGateEnforced,
      quotaMeteringEnforced,
      protectedFlowsIntact,
      behavioralBlockingNotes: blockingNotes,
    });

    return {
      repoRoot,
      verifiedStepModulesCount,
      stepBehaviorAudit,
      behaviorallyVerifiedCount,
      existenceOnlyStepCount,
      missingStepModules,
      governanceFilesIntact: missingGovernanceFiles.length === 0,
      missingGovernanceFiles,
      polarBlockedInCompanyConfig,
      gitignoreQuarantineIntact,
      npmignoreQuarantineIntact,
      blueprintTreeDigestSha256: hash.digest('hex'),
      readinessReport,
    };
  }
}
