/**
 * Marketplace Subscription Routes — Read & Create handlers
 *
 * Handlers for:
 *   POST /           — subscribe to a strategy listing
 *   GET  /           — list my subscriptions
 *   GET  /:id        — get subscription details
 */
import type { Request, Response } from 'express';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import {
  getTenantId,
  getUserId,
  getQueryString,
  getQueryNumber,
  isAdmin,
} from './marketplace-subscription-helpers';
import {
  subscribeSchema,
  subscriptionFilterSchema,
} from './marketplace-subscription-types';

const subscriptionService = SubscriptionService.getInstance();
const auditService = AuditLogService.getInstance();

/**
 * POST / — Subscribe to a strategy listing
 *
 * Creates a new marketplace subscription. Validates the listing exists,
 * allocates capital, and generates a payment checkout if needed.
 */
export async function createSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  const tenantId = getTenantId(req);
  const userId = getUserId(req);

  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await subscriptionService.subscribe({
      tenantId,
      userId,
      listingId: parsed.data.listingId,
      allocationPercent: parsed.data.allocationPercent,
      customRiskLimits: parsed.data.customRiskLimits,
    });

    logger.info('[Marketplace] Subscription created', {
      subscriptionId: result.subscription.id,
      tenantId,
      listingId: parsed.data.listingId,
    });

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: undefined,
        metadata: {
          action: 'subscription.create',
          userId,
          resourceId: result.subscription.id,
        },
      },
    );

    res.status(201).json(result);
  } catch (error) {
    logger.error('[Marketplace] Error creating subscription', {
      error,
      tenantId,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create subscription',
    });
  }
}

/**
 * GET / — List my subscriptions
 *
 * Returns paginated subscriptions for the current tenant/user.
 * Supports filtering by status.
 */
export async function listSubscriptions(
  req: Request,
  res: Response,
): Promise<void> {
  const tenantId = getTenantId(req);

  const parsed = subscriptionFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const page = getQueryNumber(req.query.page, 1);
    const limit = getQueryNumber(req.query.limit, 20);

    const result = await subscriptionService.listSubscriptions(tenantId, {
      status: parsed.data.status,
      page,
      limit,
    });

    res.json(result);
  } catch (error) {
    logger.error('[Marketplace] Error listing subscriptions', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list subscriptions',
    });
  }
}

/**
 * GET /:id — Get subscription details
 *
 * Returns a single subscription. Accessible to the subscription's tenant
 * or admin users.
 */
export async function getSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  const id = getQueryString(req.params.id);
  const tenantId = getTenantId(req);

  try {
    const subscription = await subscriptionService.getSubscription(id);
    if (!subscription) {
      res.status(404).json({
        error: 'Not found',
        message: `Subscription ${id} not found`,
      });
      return;
    }

    if (subscription.tenantId !== tenantId && !isAdmin(req)) {
      res.status(404).json({
        error: 'Not found',
        message: 'Subscription not found',
      });
      return;
    }

    res.json(subscription);
  } catch (error) {
    logger.error('[Marketplace] Error getting subscription', {
      error,
      subscriptionId: req.params.id,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get subscription',
    });
  }
}
