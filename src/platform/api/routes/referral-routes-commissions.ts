/**
 * Referral API Routes — Commission handlers
 * GET /commissions, GET /payouts, GET /my-code, GET /clicks/:code
 */

import { Request, Response } from 'express';
import { referralService } from '../../referral/referral-service';
import { paginationSchema } from '../schemas/referral.schemas';
import { resolveTenant } from '../../../shared/tenant';
import { logger } from '../../../shared/utils/logger';

/**
 * GET /api/v1/referral/commissions
 * Get commission records for current tenant
 */
export async function handleGetCommissions(req: Request, res: Response) {
  const { tenantId } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { status, page = 1, limit = 50 } = req.query;
    const parsed = paginationSchema.safeParse({ status, page, limit });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query parameters' });
    }

    const result = await referralService.getCommissions(
      tenantId,
      parsed.data.status,
      parsed.data.limit,
      (parsed.data.page - 1) * parsed.data.limit
    );

    return res.json({
      data: result.commissions,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / parsed.data.limit),
      },
    });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get commissions', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to fetch commissions' });
  }
}

/**
 * GET /api/v1/referral/payouts
 * Get payout history for current tenant
 * (Currently aggregates commission periods; future: Stripe payout details)
 */
export async function handleGetPayouts(req: Request, res: Response) {
  const { tenantId } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { page = 1, limit = 50 } = req.query;
    const parsed = paginationSchema.safeParse({ page, limit });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query parameters' });
    }

    // For now, return commission records grouped by period (payouts not yet separate)
    const result = await referralService.getCommissions(
      tenantId,
      undefined,
      parsed.data.limit,
      (parsed.data.page - 1) * parsed.data.limit
    );

    // In future, this would query a separate payouts table
    const payouts = result.commissions
      .filter((c) => c.status === 'paid')
      .map((c) => ({
        id: c.id,
        amount: c.commissionAmount,
        currency: 'USD',
        stripePayoutId: c.stripePayoutId,
        status: 'completed' as const,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        paidAt: c.paidAt,
        commissionCount: 1,
      }));

    return res.json({
      data: payouts,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: payouts.length,
        totalPages: Math.ceil(payouts.length / parsed.data.limit),
      },
    });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get payouts', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to fetch payouts' });
  }
}

/**
 * GET /api/v1/referral/my-code
 * Get referral code for the current tenant (shorthand for /code)
 * Also generates one if it doesn't exist
 */
export async function handleGetMyCode(req: Request, res: Response) {
  const { tenantId } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let code = await referralService.getReferralCode(tenantId);
    if (!code) {
      // Auto-generate if none exists
      code = await referralService.registerReferralCode(tenantId);
    }
    return res.json({ data: code });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get/generate code', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to get referral code' });
  }
}

/**
 * GET /api/v1/referral/clicks/:code
 * Get clicks for a specific referral code (for the code owner)
 */
export async function handleGetClicks(req: Request, res: Response) {
  const { tenantId } = resolveTenant(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { code } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const parsed = paginationSchema.safeParse({ page, limit });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid query parameters' });
  }

  try {
    // Verify ownership: the code must belong to this tenant
    const codeInfo = await referralService.getReferralCodeByCode(code as string);
    if (!codeInfo || codeInfo.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this referral code' });
    }

    const clicks = await referralService.getClicks(
      code as string,
      parsed.data.limit,
      (parsed.data.page - 1) * parsed.data.limit
    );

    return res.json({
      data: clicks,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        // Could add total count if needed
      },
    });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get clicks', {
  cause: error instanceof Error ? error.message : String(error),
});
    return res.status(500).json({ error: 'Failed to fetch clicks' });
  }
}
