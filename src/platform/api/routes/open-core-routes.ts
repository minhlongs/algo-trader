// SPDX-License-Identifier: MIT
/**
 * Open-Core 25-Step Blueprint Status & License Entitlement API Routes
 * Exposes live repository readiness audit, 25-step catalog, PLG flywheel, and HTTP 402 license verification.
 *
 * @module platform/api/routes/open-core-routes
 */

import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  OPEN_CORE_25_STEPS,
  RepositoryBlueprintAuditor,
  OpenCoreSaasMonetizationCoordinator,
  LicenseGate,
  BillingMeter,
  TIER_ENTITLEMENTS,
} from '../../../desk/opencoresaas2026monetization';

export const openCoreRouter: Router = Router();

const defaultMeter = new BillingMeter();

const verifyLicenseSchema = z.object({
  token: z.string().min(1),
  requiredTier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER']).default('BASIC'),
  requestedMcu: z.number().int().nonnegative().optional(),
});

openCoreRouter.get('/status', async (_req: Request, res: Response) => {
  const repoRoot = path.resolve(__dirname, '../../../../');
  const auditor = new RepositoryBlueprintAuditor();
  const blueprintAudit = await auditor.auditRepository(repoRoot);
  const telemetry = blueprintAudit.readinessReport.telemetry;

  const plgSimulation = OpenCoreSaasMonetizationCoordinator.evaluate({
    completedRestructuringSteps: blueprintAudit.verifiedStepModulesCount,
    monthlyGitHubClones: 12_500,
    activeCliDevelopers: 2_400,
    cloudConversionRate: 0.045,
    avgMonthlyMcuSpendUsd: 145,
    enterpriseSeatsCount: 28,
    enterpriseSeatPriceUsd: 1_250,
    leakedSecretsCount: telemetry.leakedSecretsCount,
    licenseGateEnforced: telemetry.licenseGateEnforced,
  });

  res.status(200).json({
    ok: blueprintAudit.readinessReport.isReadyForPublicGithub,
    blueprintAudit,
    tierEntitlements: TIER_ENTITLEMENTS,
    plgSimulation,
    stepsCatalog: OPEN_CORE_25_STEPS,
  });
});

openCoreRouter.post('/verify-license', (req: Request, res: Response) => {
  const parsed = verifyLicenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      isValid: false,
      statusCode: 400,
      reason: 'Invalid license verification request payload',
      issues: parsed.error.issues,
    });
    return;
  }

  const { token, requiredTier, requestedMcu } = parsed.data;
  const gate = new LicenseGate();
  const licenseCheck = gate.verifyToken(token, requiredTier);

  if (!licenseCheck.isValid || !licenseCheck.payload) {
    res.status(licenseCheck.statusCode).json(licenseCheck);
    return;
  }

  if (requestedMcu && requestedMcu > 0) {
    const quotaCheck = defaultMeter.checkQuota(
      licenseCheck.payload.tenantId,
      licenseCheck.payload.tier,
      requestedMcu
    );
    if (!quotaCheck.isAllowed) {
      res.status(quotaCheck.statusCode).json(quotaCheck);
      return;
    }
    defaultMeter.recordConsumption(licenseCheck.payload.tenantId, requestedMcu);
  }

  res.status(200).json(licenseCheck);
});
