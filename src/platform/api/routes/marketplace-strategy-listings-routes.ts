/**
 * Marketplace Strategy Listings Routes
 * List, publish, and get strategy details
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  publishBodySchema,
  strategyFilterSchema,
  getTenantId,
  getUserId,
} from './marketplace-strategy-helpers';
import {
  buildListStrategiesQuery,
  canPublishStrategy,
  buildCreateStrategyPayload,
  canAccessStrategyDetails,
} from './marketplace-strategy-listings-helpers';

export {
  buildListStrategiesQuery,
  canPublishStrategy,
  buildCreateStrategyPayload,
  canAccessStrategyDetails,
} from './marketplace-strategy-listings-helpers';

export const marketplaceStrategyListingsRouter: RouterType = Router();

const marketplaceService = MarketplaceService.getInstance();
const auditService = AuditLogService.getInstance();

/**
 * GET / — List published strategies with optional filters
 */
marketplaceStrategyListingsRouter.get('/', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const parsed = strategyFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues });
    }

    const result = await marketplaceService.listStrategies(buildListStrategiesQuery(parsed.data));
    return res.json(result);
  } catch (error) {
    logger.error('[Marketplace] Error listing strategies', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to list strategies' });
  }
});

/**
 * POST /publish — Create a new strategy listing (PRO/ENT tenants only)
 */
marketplaceStrategyListingsRouter.post('/publish', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    if (!canPublishStrategy(req)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'Only PRO and ENTERPRISE tenants can publish strategies',
      });
    }

    const parsed = publishBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const strategyId = `strat_${Date.now()}_${userId.slice(0, 8)}`;
    const strategy = await marketplaceService.createStrategy(
      buildCreateStrategyPayload(strategyId, tenantId, userId, parsed.data),
    );

    const listing = await marketplaceService.createListing({
      strategyId: strategy.id,
      tenantId,
      priceUsdMonthly: 0,
      billingCycle: 'monthly',
      isActive: false,
      status: 'pending_vetting' as const,
    });

    await auditService.log(tenantId, 'api_call' as AuditEventType, {
      tier: (req as Request & { user?: { tier?: string } }).user?.tier,
      metadata: {
        action: 'strategy_published', userId, resourceId: strategy.id,
        strategyName: strategy.name, category: strategy.category,
      },
    });

    logger.info('[Marketplace] Strategy published for vetting', { strategyId: strategy.id, tenantId });

    return res.status(201).json({
      strategy, listing,
      message: 'Strategy submitted for vetting. Approval required before listing becomes active.',
    });
  } catch (error) {
    logger.error('[Marketplace] Error publishing strategy', { error, tenantId: getTenantId(req) });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to publish strategy' });
  }
});

/**
 * GET /:id — Get strategy details with performance and reviews
 */
marketplaceStrategyListingsRouter.get('/:id', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const strategy = await marketplaceService.getStrategyWithDetails(id);

    if (!strategy) {
      return res.status(404).json({ error: 'Not found', message: `Strategy ${id} not found` });
    }

    if (!canAccessStrategyDetails(strategy, req)) {
      return res.status(404).json({ error: 'Not found', message: 'Strategy not found or not approved' });
    }

    return res.json(strategy);
  } catch (error) {
    logger.error('[Marketplace] Error getting strategy', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get strategy' });
  }
});
