/**
 * KYC Status Route Handlers (GET /status, GET /status/:tenantId)
 * Phase 35 Compliance — tenant and admin KYC status inspection.
 */
import type { Request, Response, Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';

export function registerKycStatusRoutes(router: RouterType): void {
  /** GET /status — Get current user's KYC verification status */
  router.get('/status', requireTier('FREE'), async (req: Request, res: Response) => {
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
  router.get('/status/:tenantId', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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
}
