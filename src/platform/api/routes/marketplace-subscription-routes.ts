/**
 * Marketplace Subscription Routes
 *
 * Endpoints:
 * - POST / - Subscribe to a strategy listing
 * - GET / - List my subscriptions
 * - GET /:id - Get subscription details
 * - PATCH /:id - Update subscription (pause/resume/cancel)
 * - GET /:id/performance - Subscriber-specific performance
 */

import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { AuditLogService, type AuditEventType } from '../../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';

export const marketplaceSubscriptionRouter: RouterType = Router();

const subscriptionService = SubscriptionService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Validation Schemas ====================

const subscribeSchema = z.object({
  listingId: z.string().min(1),
  allocationPercent: z.number().int().min(1).max(100),
  customRiskLimits: z.object({
    maxDailyLossPercent: z.number().optional(),
    maxPositionSizePercent: z.number().optional(),
    stopLossPercent: z.number().optional(),
    maxConcurrentTrades: z.number().optional(),
  }).optional(),
});

const updateSubscriptionSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel']),
});

const subscriptionFilterSchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled', 'suspended']).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ==================== Helper Functions ====================

function getTenantId(req: Request): string {
  const tenantId = (req as any).tenant?.id || (req as any).user?.tenantId;
  if (!tenantId) throw new Error('Unauthorized: No tenant context');
  return String(tenantId);
}

function getUserId(req: Request): string {
  const userId = (req as any).user?.id || (req as any).apiKey?.userId;
  if (!userId) throw new Error('Unauthorized: No user context');
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
 * POST /api/v1/marketplace/subscriptions
 * Subscribe to a strategy listing
 */
marketplaceSubscriptionRouter.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const subscription = await subscriptionService.subscribe({
      tenantId,
      userId,
      listingId: parsed.data.listingId,
      allocationPercent: parsed.data.allocationPercent,
      customRiskLimits: parsed.data.customRiskLimits,
    });

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: 'subscription_created',
          userId,
          resourceId: subscription.id,
          listingId: parsed.data.listingId,
        },
      }
    );

    logger.info('[Marketplace] Subscription created', {
      subscriptionId: subscription.id,
      tenantId,
      listingId: parsed.data.listingId,
    });

    return res.status(201).json(subscription);
  } catch (error) {
    const tenantId = getTenantId(req);
    logger.error('[Marketplace] Error creating subscription', { error, tenantId });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create subscription',
    });
  }
});

/**
 * GET /api/v1/marketplace/subscriptions
 * List my subscriptions
 */
marketplaceSubscriptionRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const parsed = subscriptionFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const filters = parsed.data;
    const result = await subscriptionService.listSubscriptions(tenantId, {
      status: filters.status,
      page: filters.page || 1,
      limit: filters.limit || 20,
    });

    return res.json(result);
  } catch (error) {
    logger.error('[Marketplace] Error listing subscriptions', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list subscriptions',
    });
  }
});

/**
 * GET /api/v1/marketplace/subscriptions/:id
 * Get subscription details
 */
marketplaceSubscriptionRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);

    const subscription = await subscriptionService.getSubscription(id);
    if (!subscription) {
      return res.status(404).json({
        error: 'Not found',
        message: `Subscription ${id} not found`,
      });
    }

    if (subscription.tenantId !== tenantId && !isAdmin(req)) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Subscription not found',
      });
    }

    return res.json(subscription);
  } catch (error) {
    logger.error('[Marketplace] Error getting subscription', {
      error,
      subscriptionId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get subscription',
    });
  }
});

/**
 * PATCH /api/v1/marketplace/subscriptions/:id
 * Update subscription (pause/resume/cancel)
 */
marketplaceSubscriptionRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = updateSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const subscription = await subscriptionService.getSubscription(id);
    if (!subscription) {
      return res.status(404).json({
        error: 'Not found',
        message: `Subscription ${id} not found`,
      });
    }

    if (subscription.tenantId !== tenantId && !isAdmin(req)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only update your own subscriptions',
      });
    }

    const updated = await subscriptionService.updateSubscriptionStatus(
      id,
      parsed.data.action,
      userId
    );

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: (req as any).user?.tier,
        metadata: {
          action: `subscription_${parsed.data.action}`,
          userId,
          resourceId: id,
        },
      }
    );

    logger.info('[Marketplace] Subscription updated', {
      subscriptionId: id,
      action: parsed.data.action,
      tenantId,
    });

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error updating subscription', {
      error,
      subscriptionId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update subscription',
    });
  }
});

/**
 * GET /api/v1/marketplace/subscriptions/:id/performance
 * Get subscriber-specific performance
 */
marketplaceSubscriptionRouter.get('/:id/performance', async (req: Request, res: Response) => {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);

    const subscription = await subscriptionService.getSubscription(id);
    if (!subscription) {
      return res.status(404).json({
        error: 'Not found',
        message: `Subscription ${id} not found`,
      });
    }

    if (subscription.tenantId !== tenantId && !isAdmin(req)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own subscription performance',
      });
    }

    const performance = await subscriptionService.getSubscriptionPerformance(id);
    return res.json(performance);
  } catch (error) {
    logger.error('[Marketplace] Error getting subscription performance', {
      error,
      subscriptionId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get subscription performance',
    });
  }
});

export default marketplaceSubscriptionRouter;
