// SPDX-License-Identifier: MIT
/**
 * Repository Blueprint Helper Evaluators & Quarantine Checkers
 * Extracted from `repository-blueprint-auditor.ts` for <85 LOC modularity.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { OverallAuditReport } from './readiness-auditor';

/**
 * Result of probing one step's behavior. Kept here (not in the probes module) so the audit shape
 * stays importable without pulling in the probe implementations.
 */
export interface StepBehaviorAuditEntry {
  readonly stepId: string;
  readonly stepNumber: number;
  readonly verified: boolean;
  readonly kind: 'behavioral' | 'absent';
  readonly evidence: string;
}

export interface LiveRepositoryBlueprintAudit {
  readonly repoRoot: string;
  readonly verifiedStepModulesCount: number;
  readonly stepBehaviorAudit: StepBehaviorAuditEntry[];
  readonly behaviorallyVerifiedCount: number;
  readonly existenceOnlyStepCount: number;
  readonly missingStepModules: string[];
  readonly governanceFilesIntact: boolean;
  readonly missingGovernanceFiles: string[];
  readonly polarBlockedInCompanyConfig: boolean;
  readonly gitignoreQuarantineIntact: boolean;
  readonly npmignoreQuarantineIntact: boolean;
  readonly blueprintTreeDigestSha256: string;
  readonly readinessReport: OverallAuditReport;
}

export const REQUIRED_GOVERNANCE_FILES = [
  'LICENSE',
  'CLA.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  '.gitleaks.toml',
  '.env.example',
] as const;

export function checkTargetModuleExistsOnDisk(repoRoot: string, targetModule: string): boolean {
  if (targetModule.includes(' vs ')) {
    return targetModule
      .split(' vs ')
      .every((segment) => fs.existsSync(path.join(repoRoot, segment.trim())));
  }
  return fs.existsSync(path.join(repoRoot, targetModule));
}

export function evaluateQuarantineAndBillingFiles(repoRoot: string): {
  readonly gitignoreQuarantineIntact: boolean;
  readonly npmignoreQuarantineIntact: boolean;
  readonly polarBlockedInCompanyConfig: boolean;
  readonly companyRawLength: number;
} {
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
  let companyRawLength = 0;
  if (fs.existsSync(companyJsonPath)) {
    const raw = fs.readFileSync(companyJsonPath, 'utf8');
    companyRawLength = raw.length;
    polarBlockedInCompanyConfig =
      raw.includes('"NOWPayments') && raw.includes('"PayOS') && raw.includes('"Polar"');
  }

  return {
    gitignoreQuarantineIntact,
    npmignoreQuarantineIntact,
    polarBlockedInCompanyConfig,
    companyRawLength,
  };
}
