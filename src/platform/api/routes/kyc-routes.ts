/**
 * KYC Verification Routes (BYOK — customer brings own Persona API key)
 * Phase 35 Compliance — identity verification for PRO+ tiers.
 *
 * Endpoints:
 * - POST /api/kyc/init       — start KYC verification (PRO+)
 * - GET  /api/kyc/status     — get current verification status (FREE)
 * - GET  /api/kyc/status/:tenantId — admin lookup (ENTERPRISE)
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';

export const kycRouter: RouterType = Router();

const _VALID_STATUSES = ['pending', 'in_progress', 'approved', 'rejected', 'expired'] as const;
const VALID_LEVELS = ['basic', 'advanced', 'full'] as const;

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

    const level = verificationLevel || 'basic';
    if (!VALID_LEVELS.includes(level as typeof VALID_LEVELS[number])) {
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

/** GET /status — Get current user's KYC verification status */
kycRouter.get('/status', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const db = getDbClient();

    const result = await db.query(
      `SELECT id, provider, status, verification_level, provider_reference, result, expires_at, created_at, updated_at
       FROM kyc_verifications
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'none', message: 'No KYC verification found' });
    }

    const r = result.rows[0] as Record<string, unknown>;
    return res.json({
      id: r.id,
      provider: r.provider,
      status: r.status,
      verificationLevel: r.verification_level,
      providerReference: r.provider_reference,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  } catch (error) {
    logger.error('[KYC] Error getting status', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get KYC status' });
  }
});

/** GET /status/:tenantId — Admin lookup (ENTERPRISE tier) */
kycRouter.get('/status/:tenantId', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId as string;
    const db = getDbClient();

    const result = await db.query(
      `SELECT id, provider, status, verification_level, provider_reference, result, expires_at, created_at, updated_at
       FROM kyc_verifications
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId],
    );

    return res.json({
      data: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        provider: r.provider,
        status: r.status,
        verificationLevel: r.verification_level,
        providerReference: r.provider_reference,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    logger.error('[KYC] Error listing verifications', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list KYC verifications' });
  }
});
