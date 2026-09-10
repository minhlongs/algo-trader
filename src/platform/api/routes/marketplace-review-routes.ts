/**
 * Marketplace Review Routes — Orchestrator
 *
 * Thin orchestrator that wires review handlers to Express routes.
 * All handler logic and schemas live in focused sub-modules.
 *
 * Endpoints:
 * - POST / - Create review (verified subscribers only)
 * - GET /strategies/:id - List reviews for a strategy
 * - POST /:id/helpful - Mark review as helpful
 * - POST /:id/report - Flag review for moderation
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { requireTier } from '../../middleware/feature-gate';
import {
  handleCreateReview,
  handleListReviews,
} from './marketplace-review-crud-handlers';
import {
  handleMarkReviewHelpful,
  handleReportReview,
} from './marketplace-review-action-handlers';

export {
  getQueryString,
  getTenantId,
  getUserId,
  createReviewSchema,
  reviewFilterSchema,
} from './marketplace-review-helpers';

export {
  handleCreateReview,
  handleListReviews,
} from './marketplace-review-crud-handlers';

export {
  handleMarkReviewHelpful,
  handleReportReview,
} from './marketplace-review-action-handlers';

export const marketplaceReviewRouter: RouterType = Router();

// ==================== Routes ====================

// POST /api/v1/marketplace/reviews
marketplaceReviewRouter.post('/', requireTier('FREE'), handleCreateReview);

// GET /api/v1/marketplace/reviews/strategies/:id
marketplaceReviewRouter.get('/strategies/:id', requireTier('FREE'), handleListReviews);

// POST /api/v1/marketplace/reviews/:id/helpful
marketplaceReviewRouter.post('/:id/helpful', requireTier('FREE'), handleMarkReviewHelpful);

// POST /api/v1/marketplace/reviews/:id/report
marketplaceReviewRouter.post('/:id/report', requireTier('FREE'), handleReportReview);

export default marketplaceReviewRouter;
