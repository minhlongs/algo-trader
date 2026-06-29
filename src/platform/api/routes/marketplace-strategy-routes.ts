/**
 * Marketplace Strategy Routes
 * CRUD operations for marketplace strategies, listings, and vetting
 *
 * Endpoints:
 * - GET /api/v1/marketplace/strategies - List published strategies (with filters)
 * - POST /api/v1/marketplace/strategies/publish - Create/publish strategy (PRO/ENT)
 * - GET /api/v1/marketplace/strategies/:id - Get strategy details
 * - PATCH /api/v1/marketplace/strategies/:id - Update strategy (owner only)
 * - POST /api/v1/marketplace/strategies/:id/vetting/request - Submit for vetting
 * - GET /api/v1/marketplace/strategies/:id/performance - Get performance metrics
 * - GET /api/v1/marketplace/strategies/:id/reviews - Get reviews
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { getStrategyLoader } from '../../../desk/strategies/loader';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import type { StrategyCategory } from '../../marketplace/models/types';

export const marketplaceStrategyRouter: RouterType = Router();

const marketplaceService = MarketplaceService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schemas ====================

const publishBodySchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().min(50).max(2000),
  category: z.enum(['arbitrage', 'momentum', 'mean-reversion', 'statistical', 'portfolio', 'risk', 'hedging', 'other']),
  riskLevel: z.number().int().min(1).max(10),
  minAllocationUsd: z.number().int().min(100).max(100000),
  maxAllocationUsd: z.number().int().min(100).max(10000000),
  supportedExchanges: z.array(z.string()).optional(),
  tags: z.array(z.string()).max(10).optional(),
  backtestSummary: z.object({
    sharpe: z.number(),
    maxDrawdown: z.number(),
    winRate: z.number().min(0).max(100),
    periodDays: z.number().int().min(30),
    totalTrades: z.number().int().optional(),
  }).optional(),
});

const updateStrategySchema = z.object({
  name: z.string().min(3).max(255).optional(),
  description: z.string().min(50).max(2000).optional(),
  tags: z.array(z.string()).max(10).optional(),
  // Cannot change category, riskLevel, or status after creation
});

const strategyFilterSchema = z.object({
  category: z.string().optional(),
  riskLevel: z.number().int().min(1).max(10).optional(),
  minSharpe: z.number().optional(),
  maxDrawdown: z.number().optional(),
  status: z.enum(['approved', 'suspended']).optional(),
  sortBy: z.enum(['sharpe', 'max_drawdown', 'win_rate', 'total_pnl', 'subscriber_count', 'created_at']).default('sharpe'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
});

const vettingRequestSchema = z.object({
  forceResubmit: z.boolean().optional().default(false),
});

// ==================== Helper Functions ====================

function getTenantId(req: Request): string {
  // Extract tenant ID from JWT or API key
  // This depends on your auth middleware implementation
  const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
  if (!tenantId) {
    throw new Error('Unauthorized: No tenant context');
  }
  return String(tenantId);
}

function getUserId(req: Request): string {
  const userId = (req as any).user?.id || (req as any).apiKey?.userId;
  if (!userId) {
    throw new Error('Unauthorized: No user context');
  }
  return String(userId);
}

function getQueryString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : String(first);
  }
  if (typeof value === 'string') return value;
  return String(value);
}

function getQueryNumber(value: unknown, defaultValue: number = 0): number {
  if (value === undefined || value === null) return defaultValue;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return parseInt(first, 10) || defaultValue;
    if (typeof first === 'number') return first;
    return defaultValue;
  }
  if (typeof value === 'string') return parseInt(value, 10) || defaultValue;
  if (typeof value === 'number') return value;
  return defaultValue;
}

function isAdmin(req: Request): boolean {
  return (req as any).user?.role === 'admin' || (req as any).apiKey?.isAdmin === true;
}

// ==================== Routes ====================

/**
 * GET /api/v1/marketplace/strategies
 * List published strategies with optional filters
 */
marketplaceStrategyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = strategyFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
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
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list strategies',
    });
  }
});

/**
 * POST /api/v1/marketplace/strategies/publish
 * Create a new strategy listing (PRO/ENT tenants only)
 */
marketplaceStrategyRouter.post('/publish', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    // Check tenant tier - only PRO/ENT can publish
    const tenantTier = (req as any).tenant?.tier || (req as any).user?.tier;
    if (tenantTier !== 'PRO' && tenantTier !== 'ENTERPRISE') {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: 'Only PRO and ENTERPRISE tenants can publish strategies',
      });
    }

    const parsed = publishBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const strategyData = parsed.data;
    const strategyId = `strat_${Date.now()}_${userId.slice(0, 8)}`;

    // Map backtestSummary to service format
    let backtestSummary: {
      totalTrades: number;
      winRate: number;
      totalPnl: number;
      sharpeRatio: number;
      maxDrawdown: number;
      periodDays?: number;
    } | undefined;
    if (strategyData.backtestSummary) {
      const bs = strategyData.backtestSummary;
      backtestSummary = {
        totalTrades: bs.totalTrades || 0,
        winRate: bs.winRate,
        totalPnl: 0, // Not provided in publish schema
        sharpeRatio: bs.sharpe ?? 0,
        maxDrawdown: bs.maxDrawdown,
        periodDays: bs.periodDays,
      };
    }

    // Create strategy in database
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

    // Create listing (inactive until approved)
    const listing = await marketplaceService.createListing({
      strategyId: strategy.id,
      tenantId,
      priceUsdMonthly: 0, // Set by admin during vetting or creator can update later
      billingCycle: 'monthly',
      isActive: false, // Only active after strategy approval
      status: 'pending_vetting' as const,
    });

    // Audit log
    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'strategy_published',
          userId,
          resourceId: strategy.id,
          strategyName: strategy.name,
          category: strategy.category,
        }
      }
    );

    logger.info('[Marketplace] Strategy published for vetting', { strategyId: strategy.id, tenantId });

    return res.status(201).json({
      strategy,
      listing,
      message: 'Strategy submitted for vetting. Approval required before listing becomes active.',
    });
  } catch (error) {
    logger.error('[Marketplace] Error publishing strategy', { error, tenantId: getTenantId(req) });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to publish strategy',
    });
  }
});

/**
 * GET /api/v1/marketplace/strategies/:id
 * Get strategy details with performance and reviews
 */
marketplaceStrategyRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const strategy = await marketplaceService.getStrategyWithDetails(id);

    if (!strategy) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${id} not found`,
      });
    }

    // Check tenant can view (only approved or own)
    const tenantId = getTenantId(req);
    const isOwner = strategy.strategy.tenantId === tenantId;
    const isApproved = strategy.strategy.status === 'approved';

    if (!isApproved && !isOwner && !isAdmin(req)) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Strategy not found or not approved',
      });
    }

    return res.json(strategy);
  } catch (error) {
    logger.error('[Marketplace] Error getting strategy', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get strategy',
    });
  }
});

/**
 * PATCH /api/v1/marketplace/strategies/:id
 * Update strategy (owner only, not allowed after vetting started)
 */
marketplaceStrategyRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = updateStrategySchema.safeParse(req.body);
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

    // Verify ownership
    if (strategy.tenantId !== tenantId || strategy.creatorId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own strategies',
      });
    }

    // Cannot update after vetting requested (status != draft)
    if (strategy.status !== 'draft') {
      return res.status(400).json({
        error: 'Cannot update',
        message: 'Strategy cannot be updated after vetting has been requested. Contact support.',
      });
    }

    const updated = await marketplaceService.updateStrategy(id, parsed.data);

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'strategy_updated',
          userId,
          resourceId: id,
          updates: parsed.data,
        }
      }
    );

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error updating strategy', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update strategy',
    });
  }
});

/**
 * POST /api/v1/marketplace/strategies/:id/vetting/request
 * Submit strategy for vetting (after creating draft)
 */
marketplaceStrategyRouter.post('/:id/vetting/request', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { forceResubmit } = req.body;

    const strategy = await marketplaceService.getStrategy(id);
    if (!strategy) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${id} not found`,
      });
    }

    // Verify ownership
    if (strategy.tenantId !== tenantId || strategy.creatorId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only submit your own strategies for vetting',
      });
    }

    // Check if already approved (can't re-vet unless rejected)
    if (strategy.status === 'approved' && !forceResubmit) {
      return res.status(400).json({
        error: 'Already approved',
        message: 'Strategy is already approved. Contact support to re-vet.',
      });
    }

    // Validate strategy has required fields
    if (!strategy.backtestSummary) {
      return res.status(400).json({
        error: 'Incomplete strategy',
        message: 'Backtest summary required before vetting. Include Sharpe ratio, max drawdown, win rate, and backtest period.',
      });
    }

    // Update status to pending
    const updated = await marketplaceService.updateStrategyStatus(id, 'pending_vetting');

    // Trigger vetting workflow (async)
    await marketplaceService.queueVettingJob(id);

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'strategy_vetting_requested',
          userId,
          resourceId: id,
        }
      }
    );

    logger.info('[Marketplace] Strategy submitted for vetting', { strategyId: id, tenantId });

    return res.json({
      strategy: updated,
      message: 'Strategy submitted for vetting. This process typically takes 1-3 business days.',
    });
  } catch (error) {
    logger.error('[Marketplace] Error requesting vetting', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to submit for vetting',
    });
  }
});

/**
 * GET /api/v1/marketplace/strategies/:id/performance
 * Get performance metrics for a strategy
 */
marketplaceStrategyRouter.get('/:id/performance', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const period = getQueryString(req.query.period, '30d');

    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details || !details.performance) {
      return res.status(404).json({
        error: 'Not found',
        message: `Performance data not found for strategy ${id}`,
      });
    }

    return res.json(details.performance);
  } catch (error) {
    logger.error('[Marketplace] Error getting performance', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get performance data',
    });
  }
});

/**
 * GET /api/v1/marketplace/strategies/:id/reviews
 * Get reviews for a strategy
 */
marketplaceStrategyRouter.get('/:id/reviews', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const page = getQueryNumber(req.query.page, 1);
    const limit = getQueryNumber(req.query.limit, 20);

    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${id} not found`,
      });
    }

    const allReviews = details.reviews || [];
    const start = (page - 1) * limit;
    const reviews = allReviews.slice(start, start + limit);

    return res.json({
      data: reviews,
      total: allReviews.length,
      page,
      limit,
      totalPages: Math.ceil(allReviews.length / limit),
    });
  } catch (error) {
    logger.error('[Marketplace] Error getting reviews', { error, strategyId: req.params.id });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get reviews',
    });
  }
});

export default marketplaceStrategyRouter;
