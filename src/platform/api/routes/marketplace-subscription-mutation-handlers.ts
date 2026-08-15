/**
 * Marketplace Subscription Routes — Update & Performance handlers
 *
 * Handlers for:
 *   PATCH /:id             — update subscription (pause/resume/cancel)
 *   GET    /:id/performance — subscriber-specific performance
 */
import type { Request, Response } from 'express';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import {
  getTenantId,
  getUserId,
  getQueryString,
  isAdmin,
} from './marketplace-subscription-helpers';
import { updateSubscriptionSchema } from './marketplace-subscription-types';

const subscriptionService = SubscriptionService.getInstance();
const auditService = AuditLogService.getInstance();

/**
 * PATCH /:id — Update subscription status (pause/resume/cancel)
 *
 * Validates the new status and updates the subscription via the service's
 * action-based method. Only the subscription owner or admin can update.
 */
export async function updateSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  const id = getQueryString(req.params.id);
  const tenantId = getTenantId(req);
  const userId = getUserId(req);

  const parsed = updateSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const existing = await subscriptionService.getSubscription(id);
    if (!existing) {
      res.status(404).json({
        error: 'Not found',
        message: `Subscription ${id} not found`,
      });
      return;
    }

    if (existing.tenantId !== tenantId && !isAdmin(req)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot update another tenant subscription',
      });
      return;
    }

    const action = parsed.data.status === 'active'
      ? 'resume'
      : parsed.data.status === 'paused'
        ? 'pause'
        : 'cancel';

    const updated = await subscriptionService.updateSubscriptionStatus(
      id,
      action,
      userId,
    );

    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: undefined,
        metadata: {
          action: `subscription.${action}`,
          userId,
          resourceId: id,
        },
      },
    );

    logger.info('[Marketplace] Subscription updated', {
      subscriptionId: id,
      tenantId,
      newStatus: parsed.data.status,
    });

    res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error updating subscription', {
      error,
      subscriptionId: id,
      tenantId,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update subscription',
    });
  }
}

/**
 * GET /:id/performance — Subscriber-specific performance metrics
 *
 * Returns PnL, win rate, and other metrics for a specific subscription.
 * Only the subscription owner or admin can view.
 */
export async function getSubscriptionPerformance(
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
      res.status(403).json({
        error: 'Forbidden',
        message: 'Cannot view another tenant performance',
      });
      return;
    }

    const performance = await subscriptionService.getSubscriptionPerformance(id);

    res.json(performance);
  } catch (error) {
    logger.error('[Marketplace] Error getting subscription performance', {
      error,
      subscriptionId: id,
      tenantId,
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get subscription performance',
    });
  }
}
