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
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { MarketplaceExecutionBridge } from '../../marketplace/services/marketplace-execution-bridge';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  subscribeSchema,
  updateSubscriptionSchema,
  subscriptionFilterSchema,
  executeSchema,
  executeSingleSchema,
  getTenantId,
  getUserId,
  getQueryString,
  isAdmin,
} from './marketplace-subscription-helpers';

export const marketplaceSubscriptionRouter: RouterType = Router();

const subscriptionService = SubscriptionService.getInstance();
const auditService = AuditLogService.getInstance();

// ==================== Routes ====================

/**
 * POST /api/v1/marketplace/subscriptions
 * Subscribe to a strategy listing
 */
marketplaceSubscriptionRouter.post('/', requireTier('FREE'), async (req: Request, res: Response) => {
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

    const result = await subscriptionService.subscribe({
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
          resourceId: result.subscription.id,
          listingId: parsed.data.listingId,
          requiresPayment: result.checkoutUrl !== null,
        },
      }
    );

    logger.info('[Marketplace] Subscription created', {
      subscriptionId: result.subscription.id,
      tenantId,
      listingId: parsed.data.listingId,
      requiresPayment: result.checkoutUrl !== null,
    });

    return res.status(201).json({
      subscription: result.subscription,
      checkoutUrl: result.checkoutUrl,
    });
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
marketplaceSubscriptionRouter.get('/', requireTier('FREE'), async (req: Request, res: Response) => {
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
marketplaceSubscriptionRouter.get('/:id', requireTier('FREE'), async (req: Request, res: Response) => {
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
marketplaceSubscriptionRouter.patch('/:id', requireTier('FREE'), async (req: Request, res: Response) => {
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
marketplaceSubscriptionRouter.get('/:id/performance', requireTier('FREE'), async (req: Request, res: Response) => {
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

// ==================== Execution Routes ====================

/**
 * POST /api/v1/marketplace/subscriptions/:id/execute
 * Execute strategy for a specific subscription (owner or admin only).
 * Used for on-demand execution testing.
 */
marketplaceSubscriptionRouter.post('/:id/execute', requireTier('FREE'), async (req: Request, res: Response) => {
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
        message: 'You can only execute your own subscriptions',
      });
    }

    const parsed = executeSingleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const bridge = MarketplaceExecutionBridge.getInstance();
    const result = await bridge.executeForSubscriber(id, parsed.data.marketPayload);

    if (!result) {
      return res.status(400).json({
        error: 'Execution failed',
        message: 'Subscription is not active or not found',
      });
    }

    return res.json(result);
  } catch (error) {
    logger.error('[Marketplace] Error executing subscription', {
      error,
      subscriptionId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to execute subscription',
    });
  }
});

/**
 * POST /api/v1/marketplace/subscriptions/execute-strategy
 * Execute strategy for ALL active subscribers (admin only).
 */
marketplaceSubscriptionRouter.post('/execute-strategy', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
  try {
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const bridge = MarketplaceExecutionBridge.getInstance();
    const results = await bridge.executeActiveForStrategy(
      parsed.data.strategyId,
      parsed.data.marketPayload,
    );

    return res.json({
      strategyId: parsed.data.strategyId,
      executions: results.length,
      results,
    });
  } catch (error) {
    logger.error('[Marketplace] Error executing strategy for subscribers', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to execute strategy for subscribers',
    });
  }
});

export default marketplaceSubscriptionRouter;
