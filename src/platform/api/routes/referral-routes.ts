/**
 * Referral API Routes
 * Endpoints for referral program management
 */

import { Router, Request, Response } from 'express';
import { referralService } from '../../referral/referral-service';
import { createReferralCode } from '../../referral/referral-crud';
import { logger } from '../../../shared/utils/logger';
import {
  trackClickSchema,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateCodeSchema,
  validateReferralSchema,
  paginationSchema,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  commissionStatusSchema,
} from '../schemas/referral.schemas';
import { requireTier } from '../../middleware/feature-gate';

export const referralRouter: Router = Router();

/**
 * Extract tenant ID from request
 * Looks for claims from JWT or API key auth
 */
function extractTenantId(req: Request): string | null {
  // Check JWT claims first (set by auth middleware)
  const claims = (req as Request & { claims?: { sub?: string; role?: string } }).claims;
  if (claims?.sub) {
    return claims.sub;
  }

  // Check API key header (X-API-Key or X-License-Key)
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const licenseKey = req.headers['x-license-key'] as string | undefined;
  const key = apiKey || licenseKey;

  if (key) {
    // In a real implementation, we'd validate the API key and extract tenant ID
    // For now, we'll rely on the auth middleware to have set req.tenantId
    return (req as Request & { tenantId?: string }).tenantId || null;
  }

  return null;
}

/**
 * Check if user is admin
 */
function isAdmin(req: Request): boolean {
  const claims = (req as Request & { claims?: { role?: string } }).claims;
  return claims?.role === 'admin';
}

/**
 * GET /api/v1/referral/stats
 * Get referral dashboard metrics for current tenant
 */
referralRouter.get('/stats', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
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
    logger.error('[ReferralRoutes] Failed to get stats:', error);
    return res.status(500).json({ error: 'Failed to fetch referral stats' });
  }
});

/**
 * GET /api/v1/referral/code
 * Get current tenant's referral code
 */
referralRouter.get('/code', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
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
    logger.error('[ReferralRoutes] Failed to get referral code:', error);
    return res.status(500).json({ error: 'Failed to fetch referral code' });
  }
});

/**
 * POST /api/v1/referral/generate-code
 * Generate a new referral code for current tenant (or specified tenant if admin)
 */
referralRouter.post('/generate-code', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Admin can generate for other tenants
  const targetTenantId = isAdmin(req) && req.body?.tenantId ? req.body.tenantId : tenantId;

  // Verify admin privilege if generating for another tenant
  if (req.body?.tenantId && req.body.tenantId !== tenantId && !isAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden: Can only generate for yourself' });
  }

  try {
    const code = await createReferralCode(targetTenantId);
    return res.status(201).json({ code: code.code, createdAt: code.createdAt });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to generate code:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate referral code';
    return res.status(400).json({ error: message });
  }
});

/**
 * POST /api/v1/referral/track-click
 * Public endpoint to track a referral link click
 * No authentication required, but rate limited
 */
referralRouter.post('/track-click', async (req: Request, res: Response) => {
  const { code } = req.query as { code?: string };
  const parsed = trackClickSchema.safeParse(req.body);

  if (!code) {
    return res.status(400).json({ error: 'Referral code is required in query parameter' });
  }
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
  }

  try {
    const tracking = await referralService.trackReferralClick(
      code,
      parsed.data.ip,
      parsed.data.userAgent,
      parsed.data.metadata
    );
    return res.status(201).json({ data: tracking });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to track click:', error);
    const message = error instanceof Error ? error.message : 'Failed to track click';
    return res.status(400).json({ error: message });
  }
});

/**
 * GET /api/v1/referral/commissions
 * Get commission records for current tenant
 */
referralRouter.get('/commissions', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
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
    logger.error('[ReferralRoutes] Failed to get commissions:', error);
    return res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

/**
 * GET /api/v1/referral/payouts
 * Get payout history for current tenant
 * (Currently aggregates commission periods; future: Stripe payout details)
 */
referralRouter.get('/payouts', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
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
    logger.error('[ReferralRoutes] Failed to get payouts:', error);
    return res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

/**
 * POST /api/v1/referral/validate
 * Validate a referral code (used during signup)
 * Public endpoint
 */
referralRouter.post('/validate', async (req: Request, res: Response) => {
  const parsed = validateReferralSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
  }

  try {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { referralCode, tenantId: newTenantId } = parsed.data;

    // Check if code exists and is valid
    const codeInfo = await referralService.getReferralCodeByCode(referralCode);
    if (!codeInfo) {
      return res.status(404).json({
        data: {
          isValid: false,
          code: referralCode,
          referringTenantId: null,
          message: 'Invalid referral code',
        },
      });
    }

    if (!codeInfo.isActive) {
      return res.json({
        data: {
          isValid: false,
          code: referralCode,
          referringTenantId: codeInfo.tenantId,
          message: 'Referral code is inactive',
        },
      });
    }

    if (codeInfo.maxUses !== null && codeInfo.usedCount >= codeInfo.maxUses) {
      return res.json({
        data: {
          isValid: false,
          code: referralCode,
          referringTenantId: codeInfo.tenantId,
          message: 'Referral code has reached maximum uses',
        },
      });
    }

    // Cannot refer yourself (basic check - would need IP validation for stronger guarantee)
    // This is a placeholder; actual self-referral prevention happens at conversion time

    return res.json({
      data: {
        isValid: true,
        code: referralCode,
        referringTenantId: codeInfo.tenantId,
        message: 'Referral code is valid',
      },
    });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to validate code:', error);
    return res.status(500).json({ error: 'Failed to validate referral code' });
  }
});

/**
 * GET /api/v1/referral/my-code
 * Get referral code for the current tenant (shorthand for /code)
 * Also generates one if it doesn't exist
 */
referralRouter.get('/my-code', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
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
    logger.error('[ReferralRoutes] Failed to get/generate code:', error);
    return res.status(500).json({ error: 'Failed to get referral code' });
  }
});

/**
 * GET /api/v1/referral/clicks/:code
 * Get clicks for a specific referral code (for the code owner)
 */
referralRouter.get('/clicks/:code', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
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
    logger.error('[ReferralRoutes] Failed to get clicks:', error);
    return res.status(500).json({ error: 'Failed to fetch clicks' });
  }
});

/**
 * GET /api/v1/referral/conversion-summary
 * Get referral conversion overview: total clicks, conversions, conversion rate, and revenue
 */
referralRouter.get('/conversion-summary', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const stats = await referralService.getReferralStats(tenantId);
    if (!stats) {
      return res.status(404).json({ error: 'No referral data found' });
    }

    res.json({
      totalClicks: stats.totalClicks,
      uniqueClicks: stats.uniqueClicks,
      conversions: stats.conversions,
      conversionRate: stats.conversionRate,
      totalRevenue: stats.totalRevenue,
      totalCommissions: stats.totalCommissions,
      pendingCommissions: stats.pendingCommissions,
      paidCommissions: stats.paidCommissions,
      topReferrers: stats.topReferrers,
      period: stats.period,
    });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to get conversion summary:', error);
    return res.status(500).json({ error: 'Failed to fetch conversion summary' });
  }
});

/**
 * POST /api/v1/referral/record-conversion
 * Internal endpoint to record a referral conversion when a new tenant signs up
 * Typically called by the auth/signup handler
 */
referralRouter.post('/record-conversion', requireTier('FREE'), async (req: Request, res: Response) => {
  const tenantId = extractTenantId(req);
  if (!tenantId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { trackingId, referralCode } = req.body as { trackingId?: string; referralCode?: string };

  if (!trackingId && !referralCode) {
    return res.status(400).json({ error: 'Either trackingId or referralCode is required' });
  }

  try {
    // Resolve tracking ID from referral code if only code was provided
    let resolvedTrackingId = trackingId;

    if (!resolvedTrackingId && referralCode) {
      // Look up the most recent click with this code that hasn't converted yet
      const clicks = await referralService.getClicks(referralCode, 1, 0);
      const unconverted = clicks.find((c) => !c.convertedAt);
      if (!unconverted) {
        return res.status(404).json({ error: 'No unconverted click found for this referral code' });
      }
      resolvedTrackingId = unconverted.id;
    }

    if (!resolvedTrackingId) {
      return res.status(400).json({ error: 'Could not resolve tracking ID' });
    }

    const convertedTenantId = req.body.convertedTenantId || tenantId;
    const convertedUserId = req.body.convertedUserId || convertedTenantId;

    await referralService.recordConversion(resolvedTrackingId, convertedTenantId, convertedUserId);

    logger.info('[ReferralRoutes] Conversion recorded', {
      trackingId: resolvedTrackingId,
      convertedTenantId,
      referredBy: referralCode || 'unknown',
    });

    return res.status(201).json({ success: true, trackingId: resolvedTrackingId });
  } catch (error) {
    logger.error('[ReferralRoutes] Failed to record conversion:', error);
    const message = error instanceof Error ? error.message : 'Failed to record conversion';
    return res.status(400).json({ error: message });
  }
});

export default referralRouter;
