/**
 * Marketplace Review Action Handlers
 * Handler logic for marking reviews as helpful and flagging reviews for moderation
 */

import { Request, Response } from 'express';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import {
  getTenantId,
  getUserId,
  getQueryString,
  AuthenticatedReviewContext,
} from './marketplace-review-helpers';

const subscriptionService = SubscriptionService.getInstance();
const auditService = AuditLogService.getInstance();

/**
 * Handle POST /:id/helpful - Mark review as helpful
 */
export async function handleMarkReviewHelpful(req: Request, res: Response): Promise<Response | void> {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const review = await subscriptionService.getReview(id);
    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: `Review ${id} not found`,
      });
    }

    if (review.isFlagged) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Cannot vote on a flagged review',
      });
    }

    const updated = await subscriptionService.markReviewHelpful(id);

    const ctx = req as unknown as AuthenticatedReviewContext;
    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: ctx.user?.tier,
        metadata: {
          action: 'review_marked_helpful',
          userId,
          resourceId: id,
          strategyId: review.strategyId,
        },
      },
    );

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error marking review helpful', {
      error,
      reviewId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to mark review as helpful',
    });
  }
}

/**
 * Handle POST /:id/report - Flag review for moderation
 */
export async function handleReportReview(req: Request, res: Response): Promise<Response | void> {
  try {
    const id = getQueryString(req.params.id);
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const review = await subscriptionService.getReview(id);
    if (!review) {
      return res.status(404).json({
        error: 'Not found',
        message: `Review ${id} not found`,
      });
    }

    const updated = await subscriptionService.flagReview(id);

    const ctx = req as unknown as AuthenticatedReviewContext;
    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: ctx.user?.tier,
        metadata: {
          action: 'review_reported',
          userId,
          resourceId: id,
          strategyId: review.strategyId,
        },
      },
    );

    logger.info('[Marketplace] Review flagged for moderation', {
      reviewId: id,
      strategyId: review.strategyId,
      tenantId,
    });

    return res.json(updated);
  } catch (error) {
    logger.error('[Marketplace] Error reporting review', {
      error,
      reviewId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to report review',
    });
  }
}
