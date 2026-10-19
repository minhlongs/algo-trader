import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OpenCoreSaas2026Monetization } from '../../../src/desk/index';
import {
  OPEN_CORE_25_STEPS,
  OpenCoreReadinessAuditor,
  RepositoryBlueprintAuditor,
  LicenseGate,
  BillingMeter,
} from '../../../src/desk/opencoresaas2026monetization/index';
import { BillingMeter as BillingMeterFacade } from '../../../src/billing/billing-meter';

const companyConfigPath = path.resolve(__dirname, '../../../.mekong/company.json');
// .mekong/ is gitignored operator state; skip on clean CI checkouts.
const hasCompanyConfig = fs.existsSync(companyConfigPath);

describe('Wave 316: 25-Step Open-Core Public GitHub + SaaS Monetization Suite (Core & Control Plane)', () => {
  it('blocks public release or SaaS flywheel when secrets leak or license gate is disabled', () => {
    const res = OpenCoreSaas2026Monetization.OpenCoreSaasMonetizationCoordinator.evaluate({
      completedRestructuringSteps: 25,
      monthlyGitHubClones: 10000,
      activeCliDevelopers: 2500,
      cloudConversionRate: 0.05,
      avgMonthlyMcuSpendUsd: 49,
      enterpriseSeatsCount: 20,
      enterpriseSeatPriceUsd: 299,
      leakedSecretsCount: 1,
      licenseGateEnforced: true,
    });
    expect(res.verdict).toBe('LEAK_OR_UNMETERED_BLOCKED');
  });

  it('flags SUBOPTIMAL_PLG_CONVERSION when steps < 25 or conversion < 2%', () => {
    const res = OpenCoreSaas2026Monetization.OpenCoreSaasMonetizationCoordinator.evaluate({
      completedRestructuringSteps: 18,
      monthlyGitHubClones: 5000,
      activeCliDevelopers: 1000,
      cloudConversionRate: 0.015,
      avgMonthlyMcuSpendUsd: 39,
      enterpriseSeatsCount: 5,
      enterpriseSeatPriceUsd: 199,
      leakedSecretsCount: 0,
      licenseGateEnforced: true,
    });
    expect(res.verdict).toBe('SUBOPTIMAL_PLG_CONVERSION');
    expect(res.completionRatio).toBeCloseTo(18 / 25, 4);
  });

  it('certifies OPENCORE_SAAS_FLY_WHEEL_OPTIMAL when all 25 steps and PLG metrics are healthy', () => {
    const res = OpenCoreSaas2026Monetization.OpenCoreSaasMonetizationCoordinator.evaluate({
      completedRestructuringSteps: 25,
      monthlyGitHubClones: 20000,
      activeCliDevelopers: 4000,
      cloudConversionRate: 0.04,
      avgMonthlyMcuSpendUsd: 50,
      enterpriseSeatsCount: 25,
      enterpriseSeatPriceUsd: 200,
      leakedSecretsCount: 0,
      licenseGateEnforced: true,
    });
    expect(res.verdict).toBe('OPENCORE_SAAS_FLY_WHEEL_OPTIMAL');
    expect(res.paidCloudSubscribers).toBe(160);
    expect(res.monthlyPlgMcuArrUsd).toBe(160 * 50 * 12);
    expect(res.enterpriseRbacArrUsd).toBe(25 * 200 * 12);
    expect(res.totalProjectedArrUsd).toBe(96000 + 60000);
  });

  it('validates all 25 catalog steps structure and phases', () => {
    expect(OPEN_CORE_25_STEPS).toHaveLength(25);
    const stepNumbers = OPEN_CORE_25_STEPS.map((s) => s.stepNumber);
    expect(stepNumbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));

    const phases = new Set(OPEN_CORE_25_STEPS.map((s) => s.phase));
    expect(phases.size).toBe(5);
    expect(phases).toContain('PHASE_1_SPLIT_AND_HYGIENE');
    expect(phases).toContain('PHASE_2_PLUGIN_AND_SEAMS');
    expect(phases).toContain('PHASE_3_CLOUD_CONTROL_PLANE');
    expect(phases).toContain('PHASE_4_ENTERPRISE_MONETIZATION');
    expect(phases).toContain('PHASE_5_PLG_GROWTH_AND_GOVERNANCE');
  });

  it('verifies that all 25 targetModule paths actually exist on disk', () => {
    const repoRoot = path.resolve(__dirname, '../../../');
    for (const step of OPEN_CORE_25_STEPS) {
      const mod = step.targetModule;
      if (mod.includes(' vs ')) {
        const parts = mod.split(' vs ');
        for (const p of parts) {
          expect(fs.existsSync(path.join(repoRoot, p.trim()))).toBe(true);
        }
      } else {
        expect(fs.existsSync(path.join(repoRoot, mod))).toBe(true);
      }
    }
  });

  it('executes OpenCoreReadinessAuditor with deterministic pass/fail gates', () => {
    const auditor = new OpenCoreReadinessAuditor();

    const failedReport = auditor.audit({
      completedSteps: 15,
      leakedSecretsCount: 2,
      licenseGateEnforced: false,
      quotaMeteringEnforced: true,
      protectedFlowsIntact: true,
    });
    expect(failedReport.isReadyForPublicGithub).toBe(false);
    expect(failedReport.blockingIssues.length).toBeGreaterThanOrEqual(2);
    expect(failedReport.readinessPercentage).toBe(60);

    const cleanReport = auditor.audit({
      completedSteps: 25,
      leakedSecretsCount: 0,
      licenseGateEnforced: true,
      quotaMeteringEnforced: true,
      protectedFlowsIntact: true,
    });
    expect(cleanReport.isReadyForPublicGithub).toBe(true);
    expect(cleanReport.blockingIssues).toHaveLength(0);
    expect(cleanReport.readinessPercentage).toBe(100);
  });

  it('verifies HMAC-SHA256 LicenseGate sign and verification with HTTP 402', () => {
    const gate = new LicenseGate('test-secret-salt-2026');
    const now = Date.now();
    const validPayload = {
      tenantId: 'tenant-algo-88',
      tier: 'PREMIUM' as const,
      issuedAt: now,
      expiresAt: now + 3600 * 1000,
      maxStrategies: 10,
      maxRps: 100,
    };

    const token = gate.signToken(validPayload);
    expect(gate.verifyToken(token, 'PREMIUM').statusCode).toBe(200);
    expect(gate.verifyToken(token, 'ENTERPRISE').statusCode).toBe(402);

    const expiredToken = gate.signToken({ ...validPayload, expiresAt: now - 1000 });
    expect(gate.verifyToken(expiredToken, 'BASIC').statusCode).toBe(402);

    const tamperedToken = token.slice(0, -4) + 'zzzz';
    expect(gate.verifyToken(tamperedToken, 'BASIC').statusCode).toBe(401);
  });

  it('meters real-time MCU consumption and verifies BillingMeter facade', () => {
    const meter = new BillingMeter();
    const tenantId = 'tenant-quant-101';
    expect(meter.checkQuota(tenantId, 'BASIC', 500).isAllowed).toBe(true);
    meter.recordConsumption(tenantId, 1000);
    expect(meter.checkQuota(tenantId, 'BASIC', 1).statusCode).toBe(402);
    expect(meter.checkQuota(tenantId, 'PREMIUM', 1).statusCode).toBe(200);
    meter.resetUsage(tenantId);
    expect(meter.getUsage(tenantId)).toBe(0);

    const facadeMeter = new BillingMeterFacade();
    expect(facadeMeter.checkQuota('t-facade', 'BASIC', 50).isAllowed).toBe(true);
  });

  it.skipIf(!hasCompanyConfig)('audits live repository blueprint tree, OSS governance files, and SHA-256 digest', () => {
    const repoRoot = path.resolve(__dirname, '../../../');
    const repoAuditor = new RepositoryBlueprintAuditor();
    const audit = repoAuditor.auditRepository(repoRoot);

    expect(audit.verifiedStepModulesCount).toBe(25);
    expect(audit.missingStepModules).toHaveLength(0);
    expect(audit.governanceFilesIntact).toBe(true);
    expect(audit.missingGovernanceFiles).toHaveLength(0);
    expect(audit.polarBlockedInCompanyConfig).toBe(true);
    expect(audit.gitignoreQuarantineIntact).toBe(true);
    expect(audit.npmignoreQuarantineIntact).toBe(true);
    expect(audit.blueprintTreeDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(audit.readinessReport.isReadyForPublicGithub).toBe(true);
  });
});
