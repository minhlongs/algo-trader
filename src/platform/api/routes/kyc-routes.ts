/**
 * KYC Verification Routes (BYOK — customer brings own Persona API key)
 * Phase 35 Compliance — identity verification for PRO+ tiers.
 *
 * Endpoints:
 * - POST /api/kyc/init       — start KYC verification (PRO+)
 * - GET  /api/kyc/status     — get current verification status (FREE)
 * - GET  /api/kyc/status/:tenantId — admin lookup (ENTERPRISE)
 * - POST /api/kyc/webhook    — Persona verification status callback (no auth)
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { VALID_LEVELS } from './kyc-types';
import { registerKycStatusRoutes } from './kyc-status-routes';
import { registerKycWebhookRoute } from './kyc-webhook-route';

export * from './kyc-types';

export const kycRouter: RouterType = Router();

/** POST /init — Initiate KYC verification (BYOK: Persona account ID from customer) */
kycRouter.post('/init', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const { tenantId, providerAccountId, verificationLevel } = req.body as {
      tenantId?: string;
      providerAccountId?: string;
      verificationLevel?: string;
    };

    if (!tenantId || !providerAccountId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'tenantId and providerAccountId are required',
      });
    }

    if (providerAccountId.length < 3) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'providerAccountId must be at least 3 characters',
      });
    }

    const level = verificationLevel || 'basic';
    if (!VALID_LEVELS.includes(level as (typeof VALID_LEVELS)[number])) {
      return res.status(400).json({
        error: 'Validation error',
        message: `verificationLevel must be one of: ${VALID_LEVELS.join(', ')}`,
      });
    }

    const db = getDbClient();

    // Check for existing pending/in_progress verification
    const existing = await db.query(
      `SELECT id FROM kyc_verifications
       WHERE tenant_id = $1 AND status IN ('pending', 'in_progress')
       LIMIT 1`,
      [tenantId],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A verification is already in progress for this tenant',
        existingId: existing.rows[0].id,
      });
    }

    const result = await db.query(
      `INSERT INTO kyc_verifications (tenant_id, provider, provider_account_id, status, verification_level)
       VALUES ($1, 'persona', $2, 'in_progress', $3)
       RETURNING id, status, verification_level, created_at`,
      [tenantId, providerAccountId, level],
    );

    const row = result.rows[0];
    logger.info('[KYC] Verification initiated', { tenantId, verificationId: row.id });

    return res.status(201).json({
      id: row.id,
      tenantId,
      status: row.status,
      verificationLevel: row.verification_level,
      createdAt: row.created_at,
    });
  } catch (error) {
    logger.error('[KYC] Error initiating verification', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to initiate KYC' });
  }
});

registerKycStatusRoutes(kycRouter);
registerKycWebhookRoute(kycRouter);
