/**
 * Marketplace Dispute Routes
 *
 * Endpoints:
 * - POST / - File a dispute
 * - GET / - List my disputes
 * - GET /:id - Get dispute details
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { requireTier } from '../../middleware/feature-gate';
import {
  fileDisputeSchema,
  disputeFilterSchema,
  getQueryString,
  getQueryNumber,
  isAdmin,
} from './marketplace-dispute-schemas';
import {
  handleFileDispute,
  handleListDisputes,
  handleGetDispute,
} from './marketplace-dispute-handlers';

export const marketplaceDisputeRouter: RouterType = Router();

export {
  fileDisputeSchema,
  disputeFilterSchema,
  getQueryString,
  getQueryNumber,
  isAdmin,
};

// ==================== Routes ====================

/**
 * POST /api/v1/marketplace/disputes
 * File a dispute against a strategy subscription
 */
marketplaceDisputeRouter.post('/', requireTier('PRO'), handleFileDispute);

/**
 * GET /api/v1/marketplace/disputes
 * List my disputes
 */
marketplaceDisputeRouter.get('/', requireTier('PRO'), handleListDisputes);

/**
 * GET /api/v1/marketplace/disputes/:id
 * Get dispute details
 */
marketplaceDisputeRouter.get('/:id', requireTier('PRO'), handleGetDispute);

export default marketplaceDisputeRouter;
