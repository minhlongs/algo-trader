/**
 * Marketplace Review CRUD Handlers
 * Handler logic for creating reviews and listing reviews by strategy
 */

import { Request, Response } from 'express';
import { SubscriptionService } from '../../marketplace/services/subscription.service';
import { MarketplaceService } from '../../marketplace/services/marketplace.service';
import { AuditLogService, type AuditEventType } from '../../audit/audit-log-service';
import { logger } from '../../../shared/utils/logger';
import {
  getTenantId,
  getUserId,
  getQueryString,
  createReviewSchema,
  reviewFilterSchema,
  AuthenticatedReviewContext,
} from './marketplace-review-helpers';

const subscriptionService = SubscriptionService.getInstance();
const marketplaceService = MarketplaceService.getInstance();
const auditService = AuditLogService.getInstance();

/**
 * Handle POST / - Create a review
 */
export async function handleCreateReview(req: Request, res: Response): Promise<Response | void> {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues,
      });
    }

    const { strategyId, rating, comment } = parsed.data;

    const strategy = await marketplaceService.getStrategy(strategyId);
    if (!strategy) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${strategyId} not found`,
      });
    }

    if (strategy.status !== 'approved') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Cannot review a strategy that is not approved',
      });
    }

    const hasSubscription = await subscriptionService.hasActiveSubscription(
      tenantId,
      strategyId,
    );
    if (!hasSubscription) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only verified subscribers can write reviews',
      });
    }

    const review = await subscriptionService.createReview({
      strategyId,
      tenantId,
      userId,
      rating,
      comment,
    });

    const ctx = req as unknown as AuthenticatedReviewContext;
    await auditService.log(
      tenantId,
      'api_call' as AuditEventType,
      {
        tier: ctx.user?.tier,
        metadata: {
          action: 'review_created',
          userId,
          resourceId: review.id,
          strategyId,
          rating,
        },
      },
    );

    logger.info('[Marketplace] Review created', {
      reviewId: review.id,
      strategyId,
      tenantId,
      rating,
    });

    return res.status(201).json(review);
  } catch (error) {
    logger.error('[Marketplace] Error creating review', { error });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create review',
    });
  }
}

/**
 * Handle GET /strategies/:id - List reviews for a strategy
 */
export async function handleListReviews(req: Request, res: Response): Promise<Response | void> {
  try {
    const id = getQueryString(req.params.id);

    const parsed = reviewFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const filters = parsed.data;
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const details = await marketplaceService.getStrategyWithDetails(id);
    if (!details) {
      return res.status(404).json({
        error: 'Not found',
        message: `Strategy ${id} not found`,
      });
    }

    const allReviews = details.reviews || [];
    const reviews = allReviews.slice(offset, offset + limit);

    return res.json({
      data: reviews,
      total: allReviews.length,
      page,
      limit,
      totalPages: Math.ceil(allReviews.length / limit),
    });
  } catch (error) {
    logger.error('[Marketplace] Error listing reviews', {
      error,
      strategyId: req.params.id,
    });
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to list reviews',
    });
  }
}
