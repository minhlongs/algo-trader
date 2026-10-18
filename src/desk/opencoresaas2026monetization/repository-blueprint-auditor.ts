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
} from './repository-blueprint-helpers';

export * from './repository-blueprint-helpers';

export class RepositoryBlueprintAuditor {
  private readonly secretSalt: string;

  constructor(secretSalt = 'algo-trader-opencore-tree-salt-2026') {
    this.secretSalt = secretSalt;
  }

  auditRepository(repoRoot: string): LiveRepositoryBlueprintAudit {
    const missingStepModules: string[] = [];
    const hash = crypto.createHmac('sha256', this.secretSalt);

    for (const step of OPEN_CORE_25_STEPS) {
      const exists = checkTargetModuleExistsOnDisk(repoRoot, step.targetModule);
      if (!exists) {
        missingStepModules.push(`Step ${step.stepNumber} (${step.id}): ${step.targetModule}`);
      }
      hash.update(`${step.stepNumber}:${step.id}:${step.targetModule}:${exists ? '1' : '0'}\n`);
    }

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
    const licenseGateEnforced = fs.existsSync(
      path.join(repoRoot, 'src/desk/opencoresaas2026monetization/license-gate.ts'),
    );
    const quotaMeteringEnforced = fs.existsSync(
      path.join(repoRoot, 'src/desk/opencoresaas2026monetization/billing-meter.ts'),
    );
    const protectedFlowsIntact =
      polarBlockedInCompanyConfig && missingGovernanceFiles.length === 0;

    const readinessAuditor = new OpenCoreReadinessAuditor();
    const readinessReport = readinessAuditor.audit({
      completedSteps: verifiedStepModulesCount,
      leakedSecretsCount,
      licenseGateEnforced,
      quotaMeteringEnforced,
      protectedFlowsIntact,
    });

    return {
      repoRoot,
      verifiedStepModulesCount,
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
