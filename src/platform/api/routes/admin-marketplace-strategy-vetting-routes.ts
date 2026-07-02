/**
 * Admin Marketplace — Strategy Vetting Routes
 *
 * Routes:
 * - GET /strategies/pending — List pending vetting strategies
 * - POST /strategies/:id/vetting/decision — Approve/reject strategy
 * - GET /strategies/:id/history — Vetting audit trail
 */

import { Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { VettingService } from '../../marketplace/services/vetting.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  getTenantId,
  getUserId,
  isAdmin,
  getQueryString,
} from './admin-marketplace-helpers';

const marketplaceService = MarketplaceService.getInstance();
const vettingService = VettingService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schema ====================

export const vettingDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().max(5000).optional(),
});

// ==================== Route Registration ====================

export function registerMarketplaceVettingRoutes(router: RouterType): void {
  /**
   * GET /api/admin/marketplace/strategies/pending
   * List pending vetting strategies
   */
  router.get('/strategies/pending', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const page = parseInt(getQueryString(req.query.page, '1')) || 1;
      const limit = parseInt(getQueryString(req.query.limit, '50')) || 50;

      const result = await marketplaceService.listStrategies({
        status: 'pending_vetting',
        page,
        limit,
      });

      return res.json(result);
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error listing pending strategies', { error });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list pending strategies',
      });
    }
  });

  /**
   * POST /api/admin/marketplace/strategies/:id/vetting/decision
   * Approve or reject a strategy
   */
  router.post('/strategies/:id/vetting/decision', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const id = getQueryString(req.params.id);
      const adminUserId = getUserId(req);

      const parsed = vettingDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: parsed.error.issues,
        });
      }

      const strategy = await marketplaceService.getStrategy(id);
      if (!strategy) {
        return res.status(404).json({
          error: 'Not found',
          message: `Strategy ${id} not found`,
        });
      }

      if (strategy.status !== 'pending_vetting') {
        return res.status(400).json({
          error: 'Invalid state',
          message: `Strategy is not pending vetting (current: ${strategy.status})`,
        });
      }

      let updated;
      if (parsed.data.decision === 'approve') {
        updated = await vettingService.approveStrategy(id, adminUserId, parsed.data.notes);
      } else {
        updated = await vettingService.rejectStrategy(id, adminUserId, parsed.data.notes || 'Rejected');
      }

      await auditService.log(
        strategy.tenantId,
        'api_call' as AuditEventType,
        {
          tier: (req as any).user?.tier,
          metadata: {
            action: `vetting_${parsed.data.decision}d`,
            adminUserId,
            resourceId: id,
            strategyName: strategy.name,
            notes: parsed.data.notes,
          },
        }
      );

      logger.info('[MarketplaceAdmin] Vetting decision recorded', {
        strategyId: id,
        decision: parsed.data.decision,
        adminUserId,
      });

      return res.json(updated);
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error recording vetting decision', { error, strategyId: req.params.id });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to record vetting decision',
      });
    }
  });

  /**
   * GET /api/admin/marketplace/strategies/:id/history
   * Vetting audit trail for a strategy
   */
  router.get('/strategies/:id/history', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      }

      const id = getQueryString(req.params.id);

      const history = await vettingService.getVettingHistory(id);
      return res.json(history);
    } catch (error) {
      logger.error('[MarketplaceAdmin] Error getting vetting history', { error, strategyId: req.params.id });
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to get vetting history',
      });
    }
  });
}
