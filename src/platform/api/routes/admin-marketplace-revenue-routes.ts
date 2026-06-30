/**
 * Admin Marketplace — Revenue Routes
 *
 * Routes:
 * - GET /revenue — Platform revenue overview
 * - GET /revenue/creators — All creator payouts
 */

import { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { RevenueService } from '../../marketplace/services/revenue.service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  isAdmin,
  getQueryString,
} from './admin-marketplace-helpers';

const revenueService = RevenueService.getInstance();

// ==================== Validation Schema ====================

export const revenueFilterSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

// ==================== Route Registration ====================

export function registerMarketplaceRevenueRoutes(router: RouterType): void {
  /**
   * GET /api/admin/marketplace/revenue
   * Platform revenue overview
   */
  router.get('/revenue', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const parsed = revenueFilterSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: parsed.error.issues,
        });
      }

      const overview = await revenueService.getRevenueOverview({
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
      });

      return res.json(overview);
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error getting revenue overview', { error });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get revenue overview',
      });
    }
  });

  /**
   * GET /api/admin/marketplace/revenue/creators
   * All creator payouts
   */
  router.get('/revenue/creators', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const payouts = await revenueService.getAllCreatorPayouts();
      return res.json(payouts);
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error getting creator payouts', { error });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get creator payouts',
      });
    }
  });
}
