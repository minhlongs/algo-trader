/**
 * Referral API Routes — Admin handlers
 * GET /stats, GET /code, POST /generate-code
 */

import { Request, Response } from 'express';
import { referralService } from '../../referral/referral-service';
import { resolveTenant } from '../../../shared/tenant';
import { logger } from '../../../shared/utils/logger';

export function isTenantAdmin(ctx: { role?: string }): boolean {
  return ctx.role === 'admin';
}

/**
 * GET /api/v1/referral/stats
 * Get referral dashboard metrics for current tenant
 */
export async function handleGetStats(req: Request, res: Response) {
  const { tenantId } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const stats = await referralService.getReferralStats(tenantId);
    if (!stats) {
      return res.status(404).json({ error: 'No referral data found' });
    }
    return res.json({ data: stats });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get stats', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to fetch referral stats' });
  }
}

/**
 * GET /api/v1/referral/code
 * Get current tenant's referral code
 */
export async function handleGetCode(req: Request, res: Response) {
  const { tenantId } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const code = await referralService.getReferralCode(tenantId);
    if (!code) {
      return res.status(404).json({
        error: 'No referral code found',
        message: 'Generate a referral code first',
      });
    }
    return res.json({ data: code });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get referral code', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to fetch referral code' });
  }
}

/**
 * POST /api/v1/referral/generate-code
 * Generate a new referral code for current tenant (or specified tenant if admin)
 */
export async function handleGenerateCode(req: Request, res: Response) {
  const { tenantId, role } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Admin can generate for other tenants
  const targetTenantId = req.body?.tenantId ? req.body.tenantId : tenantId;

  // Verify admin privilege if generating for another tenant
  if (req.body?.tenantId && req.body.tenantId !== tenantId && !isTenantAdmin({ role })) {
    return res.status(403).json({ error: 'Forbidden: Can only generate for yourself' });
  }

  try {
    const code = await referralService.registerReferralCode(targetTenantId);
    return res.status(201).json(code);
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to generate code', {
  cause: error instanceof Error ? error.message : String(error),
});
    const message = error instanceof Error ? error.message : 'Failed to generate referral code';
    return res.status(400).json({ error: message });
  }
}
