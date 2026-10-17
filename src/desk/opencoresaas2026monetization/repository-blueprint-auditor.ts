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
import { OpenCoreReadinessAuditor, OverallAuditReport } from './readiness-auditor';

export interface LiveRepositoryBlueprintAudit {
  readonly repoRoot: string;
  readonly verifiedStepModulesCount: number;
  readonly missingStepModules: string[];
  readonly governanceFilesIntact: boolean;
  readonly missingGovernanceFiles: string[];
  readonly polarBlockedInCompanyConfig: boolean;
  readonly gitignoreQuarantineIntact: boolean;
  readonly npmignoreQuarantineIntact: boolean;
  readonly blueprintTreeDigestSha256: string;
  readonly readinessReport: OverallAuditReport;
}

const REQUIRED_GOVERNANCE_FILES = [
  'LICENSE',
  'CLA.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  '.gitleaks.toml',
  '.env.example',
] as const;

export class RepositoryBlueprintAuditor {
  private readonly secretSalt: string;

  constructor(secretSalt = 'algo-trader-opencore-tree-salt-2026') {
    this.secretSalt = secretSalt;
  }

  private checkTargetModuleExists(repoRoot: string, targetModule: string): boolean {
    if (targetModule.includes(' vs ')) {
      return targetModule
        .split(' vs ')
        .every((segment) => fs.existsSync(path.join(repoRoot, segment.trim())));
    }
    return fs.existsSync(path.join(repoRoot, targetModule));
  }

  auditRepository(repoRoot: string): LiveRepositoryBlueprintAudit {
    const missingStepModules: string[] = [];
    const hash = crypto.createHmac('sha256', this.secretSalt);

    for (const step of OPEN_CORE_25_STEPS) {
      const exists = this.checkTargetModuleExists(repoRoot, step.targetModule);
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

    const gitignorePath = path.join(repoRoot, '.gitignore');
    const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
    const gitignoreQuarantineIntact =
      gitignoreContent.includes('.env') && gitignoreContent.includes('.mekong/');

    const npmignorePath = path.join(repoRoot, '.npmignore');
    const npmignoreContent = fs.existsSync(npmignorePath) ? fs.readFileSync(npmignorePath, 'utf8') : '';
    const npmignoreQuarantineIntact =
      npmignoreContent.includes('.env') &&
      npmignoreContent.includes('.mekong/') &&
      npmignoreContent.includes('.claude/');

    const companyJsonPath = path.join(repoRoot, '.mekong/company.json');
    let polarBlockedInCompanyConfig = false;
    if (fs.existsSync(companyJsonPath)) {
      const raw = fs.readFileSync(companyJsonPath, 'utf8');
      hash.update(`company:${raw.length}\n`);
      polarBlockedInCompanyConfig =
        raw.includes('"NOWPayments') && raw.includes('"PayOS') && raw.includes('"Polar"');
    }

    const verifiedStepModulesCount = OPEN_CORE_25_STEPS.length - missingStepModules.length;
    const leakedSecretsCount = gitignoreQuarantineIntact && npmignoreQuarantineIntact ? 0 : 1;
    const licenseGateEnforced = fs.existsSync(
      path.join(repoRoot, 'src/desk/opencoresaas2026monetization/license-gate.ts')
    );
    const quotaMeteringEnforced = fs.existsSync(
      path.join(repoRoot, 'src/desk/opencoresaas2026monetization/billing-meter.ts')
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
