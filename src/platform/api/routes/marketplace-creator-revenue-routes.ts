/**
 * Marketplace Creator Revenue Routes
 *
 * Creator-facing endpoints for earnings, dashboard, and payout history.
 *
 * Endpoints:
 * - GET /my-earnings — creator's revenue shares (paginated)
 * - GET /dashboard — creator revenue dashboard (totals, trends, top strategies)
 */

import { Router, type Request, type Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { RevenueService } from '../../marketplace/services/revenue.service';
import { revenueShareRepository } from '../../marketplace/repositories/revenue-share-repository';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';

const revenueService = RevenueService.getInstance();

export const marketplaceCreatorRevenueRouter: RouterType = Router();

// ==================== Validation ====================

const earningsQuerySchema = z.object({
  status: z.enum(['pending', 'paid', 'void']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ==================== Helpers ====================

function getTenantId(req: Request): string {
  const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

// ==================== Routes ====================

/**
 * GET /api/v1/marketplace/revenue/my-earnings
 * List creator's revenue shares (paginated, filterable by status)
 */
marketplaceCreatorRevenueRouter.get('/my-earnings', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const parsed = earningsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query', details: parsed.error.issues });
    }

    const result = await revenueShareRepository.findAll(
      { tenantId, status: parsed.data.status },
      { page: parsed.data.page, limit: parsed.data.limit },
      { field: 'created_at', order: 'desc' },
    );

    return res.json(result);
  } catch (error) {
    logger.error('[CreatorRevenue] Error listing earnings', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list earnings' });
  }
});

/**
 * GET /api/v1/marketplace/revenue/dashboard
 * Creator revenue dashboard — totals, pending payouts, recent activity
 */
marketplaceCreatorRevenueRouter.get('/dashboard', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const totals = await revenueShareRepository.getCreatorTotals(tenantId);

    // Recent pending payouts
    const pending = await revenueShareRepository.findAll(
      { tenantId, status: 'pending' },
      { page: 1, limit: 5 },
      { field: 'created_at', order: 'desc' },
    );

    // Recently paid
    const paid = await revenueShareRepository.findAll(
      { tenantId, status: 'paid' },
      { page: 1, limit: 5 },
      { field: 'paid_at', order: 'desc' },
    );

    return res.json({
      tenantId,
      totalEarningsCents: totals.totalRevenue,
      totalPaidCents: totals.totalPayouts,
      pendingPayoutCents: totals.pending,
      pendingCount: pending.total,
      recentPending: pending.data,
      recentPaid: paid.data,
    });
  } catch (error) {
    logger.error('[CreatorRevenue] Error getting dashboard', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get dashboard' });
  }
});

/**
 * GET /api/v1/marketplace/revenue/dashboard
 * Get revenue report for a specific period
 */
marketplaceCreatorRevenueRouter.get('/report', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const startStr = req.query.start as string | undefined;
    const endStr = req.query.end as string | undefined;

    const periodStart = startStr ? new Date(startStr) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = endStr ? new Date(endStr) : new Date();

    const report = await revenueService.getRevenueReport(tenantId, {
      start: periodStart,
      end: periodEnd,
    });

    return res.json(report);
  } catch (error) {
    logger.error('[CreatorRevenue] Error getting report', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get revenue report' });
  }
});

export default marketplaceCreatorRevenueRouter;
