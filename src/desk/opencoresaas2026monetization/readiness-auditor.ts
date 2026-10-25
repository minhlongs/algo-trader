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
  /**
   * Problems found while probing behavior. They must fail the verdict, so they are passed in
   * rather than appended afterwards — appending would arrive after the flag was computed.
   */
  readonly behavioralBlockingNotes?: readonly string[];
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
    const blockingIssues: string[] = [...(telemetry.behavioralBlockingNotes ?? [])];

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

    // Any blocking issue must fail the verdict. Computing readiness from the individual flags
    // alone lets a caller append an unresolved problem and still report ready.
    const isReadyForPublicGithub =
      blockingIssues.length === 0 &&
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
