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
import type { StrategyCategory } from '../../marketplace/models/types';
import {
  publishBodySchema,
  strategyFilterSchema,
  getTenantId,
  getUserId,
  isAdmin,
} from './marketplace-strategy-helpers';

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

    const filters = parsed.data;
    const result = await marketplaceService.listStrategies({
      category: filters.category as StrategyCategory | undefined,
      riskLevel: filters.riskLevel,
      minSharpe: filters.minSharpe,
      maxDrawdown: filters.maxDrawdown,
      status: filters.status || 'approved',
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      page: filters.page || 1,
      limit: filters.limit || 20,
      search: filters.search,
    });

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

    const tenantTier = (req as any).tenant?.tier || (req as any).user?.tier;
    if (tenantTier !== 'PRO' && tenantTier !== 'ENTERPRISE') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'Only PRO and ENTERPRISE tenants can publish strategies',
      });
    }

    const parsed = publishBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    }

    const strategyData = parsed.data;
    const strategyId = `strat_${Date.now()}_${userId.slice(0, 8)}`;

    let backtestSummary: {
      totalTrades: number; winRate: number; totalPnl: number;
      sharpeRatio: number; maxDrawdown: number; periodDays?: number;
    } | undefined;
    if (strategyData.backtestSummary) {
      const bs = strategyData.backtestSummary;
      backtestSummary = {
        totalTrades: bs.totalTrades || 0,
        winRate: bs.winRate,
        totalPnl: 0,
        sharpeRatio: bs.sharpe ?? 0,
        maxDrawdown: bs.maxDrawdown,
        periodDays: bs.periodDays,
      };
    }

    const strategy = await marketplaceService.createStrategy({
      id: strategyId,
      tenantId,
      creatorId: userId,
      name: strategyData.name,
      description: strategyData.description,
      category: strategyData.category,
      riskLevel: strategyData.riskLevel,
      minAllocationUsd: strategyData.minAllocationUsd,
      maxAllocationUsd: strategyData.maxAllocationUsd,
      supportedExchanges: strategyData.supportedExchanges || [],
      tags: strategyData.tags || [],
      backtestSummary: backtestSummary as any,
    });

    const listing = await marketplaceService.createListing({
      strategyId: strategy.id,
      tenantId,
      priceUsdMonthly: 0,
      billingCycle: 'monthly',
      isActive: false,
      status: 'pending_vetting' as const,
    });

    await auditService.log(tenantId, 'api_call' as AuditEventType, {
      tier: (req as any).user?.tier,
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

    const tenantId = getTenantId(req);
    const isOwner = strategy.strategy.tenantId === tenantId;
    const isApproved = strategy.strategy.status === 'approved';

    if (!isApproved && !isOwner && !isAdmin(req)) {
      return res.status(404).json({ error: 'Not found', message: 'Strategy not found or not approved' });
    }

    return res.json(strategy);
  } catch (error) {
    logger.error('[Marketplace] Error getting strategy', { error, strategyId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to get strategy' });
  }
});
