// SPDX-License-Identifier: MIT
/**
 * 25-Step Open-Core & SaaS Readiness Auditor
 * Evaluates the readiness of the 25 open-core steps and blocks secret leaks.
 *
 * @module desk/opencoresaas2026monetization/readiness-auditor
 */

import { OPEN_CORE_25_STEPS, OpenCoreStep } from './catalog';

export interface AuditTelemetry {
  readonly completedSteps: number;
  readonly leakedSecretsCount: number;
  readonly licenseGateEnforced: boolean;
  readonly quotaMeteringEnforced: boolean;
  readonly protectedFlowsIntact: boolean;
}

export interface StepAuditResult {
  readonly step: OpenCoreStep;
  readonly isImplemented: boolean;
  readonly statusNote: string;
}

export interface OverallAuditReport {
  readonly totalSteps: number;
  readonly completedStepsCount: number;
  readonly readinessPercentage: number;
  readonly isReadyForPublicGithub: boolean;
  readonly blockingIssues: string[];
  readonly stepResults: StepAuditResult[];
  readonly telemetry: AuditTelemetry;
}

export class OpenCoreReadinessAuditor {
  audit(telemetry: AuditTelemetry): OverallAuditReport {
    const blockingIssues: string[] = [];

    if (telemetry.leakedSecretsCount > 0) {
      blockingIssues.push(`CRITICAL: Found ${telemetry.leakedSecretsCount} unpurged secrets in codebase or git tree.`);
    }
    if (!telemetry.licenseGateEnforced) {
      blockingIssues.push('SECURITY: Cryptographic HMAC-SHA256 LicenseGate is not enforced for cloud tiers.');
    }
    if (!telemetry.quotaMeteringEnforced) {
      blockingIssues.push('BILLING: Real-time MCU/API quota metering with HTTP 402 is not enabled.');
    }
    if (!telemetry.protectedFlowsIntact) {
      blockingIssues.push('POLICY: Protected flows (Setup Wizard, Telegram Bot, NOWPayments/PayOS) compromised.');
    }

    const stepResults: StepAuditResult[] = OPEN_CORE_25_STEPS.map((step) => {
      const isImplemented = step.stepNumber <= telemetry.completedSteps;
      return {
        step,
        isImplemented,
        statusNote: isImplemented ? 'Completed & Verified' : 'Pending Deployment',
      };
    });

    const isReadyForPublicGithub =
      telemetry.leakedSecretsCount === 0 &&
      telemetry.licenseGateEnforced &&
      telemetry.quotaMeteringEnforced &&
      telemetry.protectedFlowsIntact &&
      telemetry.completedSteps >= 20;

    const percentage = Math.round((Math.min(telemetry.completedSteps, 25) / 25) * 100);

    return {
      totalSteps: 25,
      completedStepsCount: Math.min(telemetry.completedSteps, 25),
      readinessPercentage: percentage,
      isReadyForPublicGithub,
      blockingIssues,
      stepResults,
      telemetry,
    };
  }
}
