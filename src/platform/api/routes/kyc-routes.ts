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
import { verifyHmacSha256 } from '../../../shared/utils/hmac-verifier';

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

    if (providerAccountId.length < 3) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'providerAccountId must be at least 3 characters',
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
    const expiresAt = r.expires_at as string | null;
    const isExpired = expiresAt && new Date(expiresAt) < new Date();

    return res.json({
      id: r.id,
      provider: r.provider,
      status: isExpired ? 'expired' : r.status,
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
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const result = await db.query(
      `SELECT id, provider, status, verification_level, provider_reference, result, expires_at, created_at, updated_at
       FROM kyc_verifications
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit],
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

// ------------------------------------------------------------------
// Webhook — Persona verification status callback (no tier auth)
// ------------------------------------------------------------------

const ALLOWED_STATUSES = ['approved', 'rejected', 'pending'] as const;

/** POST /webhook — receive Persona verification status update */
kycRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.PERSONA_WEBHOOK_SECRET ?? '';
    const signature = req.headers['x-signature-256'] as string | undefined;
    const tsHeader = req.headers['x-timestamp'] as string | undefined;

    if (!webhookSecret) {
      logger.error('[KYC] PERSONA_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    if (!tsHeader) {
      return res.status(401).json({ error: 'Missing timestamp' });
    }

    const tsSeconds = Number(tsHeader);
    if (Number.isNaN(tsSeconds)) {
      return res.status(401).json({ error: 'Invalid timestamp' });
    }

    const rawBody = JSON.stringify(req.body);
    if (!verifyHmacSha256(rawBody, signature, webhookSecret, tsSeconds)) {
      logger.warn('[KYC] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { tenantId, status, id: verificationId, providerReference } = req.body as {
      tenantId?: string;
      status?: string;
      id?: string;
      providerReference?: string;
    };

    if (!tenantId || !status || !verificationId) {
      return res.status(400).json({ error: 'Missing required fields: tenantId, status, id' });
    }

    if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: `Invalid status: must be one of ${ALLOWED_STATUSES.join(', ')}` });
    }

    const db = getDbClient();
    const ref = providerReference ?? verificationId;

    // Find existing verification by provider_reference
    const existing = await db.query(
      'SELECT id FROM kyc_verifications WHERE provider_reference = $1 AND tenant_id = $2',
      [ref, tenantId],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    const verifiedAt = status === 'approved' ? 'NOW()' : 'NULL';

    await db.query(
      `UPDATE kyc_verifications
       SET status = $1,
           verified_at = ${verifiedAt},
           updated_at = NOW()
       WHERE provider_reference = $2 AND tenant_id = $3`,
      [status, ref, tenantId],
    );

    logger.info('[KYC] Webhook processed', { tenantId, status, verificationId });

    return res.status(200).json({ received: true, verificationId, status });
  } catch (error) {
    logger.error('[KYC] Error processing webhook', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to process webhook' });
  }
});
