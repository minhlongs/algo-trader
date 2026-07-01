/**
 * Marketplace Strategy Management Routes
 * Update strategy and submit for vetting
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  updateStrategySchema,
  getTenantId,
  getUserId,
} from './marketplace-strategy-helpers';

export const marketplaceStrategyManagementRouter: RouterType = Router();

const marketplaceService = MarketplaceService.getInstance();
const auditService = AuditLogService.getInstance();

/**
 * PATCH /:id — Update strategy (owner only, not allowed after vetting started)
 */
marketplaceStrategyManagementRouter.patch('/:id', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = updateStrategySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const strategy = await marketplaceService.getStrategy(id);
    if (!strategy) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    if (strategy.tenantId !== tenantId || strategy.creatorId !== userId) {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own strategies' });
    }

    if (strategy.status !== 'draft') {
      return res.status(400).json({
        error: 'Cannot update',
        message: 'Strategy cannot be updated after vetting has been requested. Contact support.',
      });
    }

    const updated = await marketplaceService.updateStrategy(id, parsed.data);

    await auditService.log(tenantId, 'api_call' as AuditEventType, {
      tier: (req as any).user?.tier,
      metadata: { action: 'strategy_updated', userId, resourceId: id, updates: parsed.data },
    });

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error updating strategy', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to update strategy' });
  }
});

/**
 * POST /:id/vetting/request — Submit strategy for vetting
 */
marketplaceStrategyManagementRouter.post('/:id/vetting/request', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { forceResubmit } = req.body;

    const strategy = await marketplaceService.getStrategy(id);
    if (!strategy) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    if (strategy.tenantId !== tenantId || strategy.creatorId !== userId) {
      return res.status(403).json({
        error: 'Forbidden', message: 'You can only submit your own strategies for vetting',
      });
    }

    if (strategy.status === 'approved' && !forceResubmit) {
      return res.status(400).json({
        error: 'Already approved',
        message: 'Strategy is already approved. Contact support to re-vet.',
      });
    }

    if (!strategy.backtestSummary) {
      return res.status(400).json({
        error: 'Incomplete strategy',
        message: 'Backtest summary required before vetting. Include Sharpe ratio, max drawdown, win rate, and backtest period.',
      });
    }

    const updated = await marketplaceService.updateStrategyStatus(id, 'pending_vetting');
    await marketplaceService.queueVettingJob(id);

    await auditService.log(tenantId, 'api_call' as AuditEventType, {
      tier: (req as any).user?.tier,
      metadata: { action: 'strategy_vetting_requested', userId, resourceId: id },
    });

    logger.info('[Marketplace] Strategy submitted for vetting', { strategyId: id, tenantId });

    return res.json({
      strategy: updated,
      message: 'Strategy submitted for vetting. This process typically takes 1-3 business days.',
    });
  } catch (error) {
    logger.error('[Marketplace] Error requesting vetting', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to submit for vetting' });
  }
});
