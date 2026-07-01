/**
 * Admin Marketplace — Revenue Routes
 *
 * Routes:
 * - GET /revenue — Platform revenue overview
 * - GET /revenue/creators — All creator payouts
 * - POST /revenue/mark-paid — Batch mark revenue shares as paid
 * - POST /revenue/mark-paid/:id — Mark single revenue share as paid
 */

import { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { RevenueService } from '../../marketplace/services/revenue.service';
import { revenueShareRepository } from '../../marketplace/repositories/revenue-share-repository';
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

const markPaidSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  stripePayoutId: z.string().optional(),
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

  /**
   * POST /api/admin/marketplace/revenue/mark-paid
   * Batch mark revenue shares as paid (admin only)
   */
  router.post('/revenue/mark-paid', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const parsed = markPaidSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      }

      const results: { id: string; status: string; error?: string }[] = [];

      for (const id of parsed.data.ids) {
        try {
          const record = await revenueShareRepository.findById(id);
          if (!record) {
            results.push({ id, status: 'not_found', error: 'Revenue share not found' });
            continue;
          }
          if (record.status === 'paid') {
            results.push({ id, status: 'skipped', error: 'Already paid' });
            continue;
          }
          await revenueShareRepository.markAsPaid(id, parsed.data.stripePayoutId);
          results.push({ id, status: 'paid' });
        } catch (err) {
          results.push({ id, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      const paid = results.filter((r) => r.status === 'paid').length;
      logger.info('[MarketplaceAdmin] Batch mark-as-paid complete', {
        total: parsed.data.ids.length,
        paid,
        errors: results.length - paid,
      });

      return res.json({ processed: results.length, paid, results });
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error marking revenue as paid', { error });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to mark as paid' });
    }
  });

  /**
   * POST /api/admin/marketplace/revenue/mark-paid/:id
   * Mark single revenue share as paid (admin only)
   */
  router.post('/revenue/mark-paid/:id', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const id = getQueryString(req.params.id);
      const stripePayoutId = req.body?.stripePayoutId as string | undefined;

      const record = await revenueShareRepository.findById(id);
      if (!record) {
        return res.status(404).json({ error: 'Not found', message: `Revenue share ${id} not found` });
      }
      if (record.status === 'paid') {
        return res.status(409).json({ error: 'Conflict', message: 'Revenue share already paid' });
      }

      const updated = await revenueShareRepository.markAsPaid(id, stripePayoutId);
      return res.json(updated);
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error marking single revenue as paid', { error, id: req.params.id });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to mark as paid' });
    }
  });
}
