/**
 * Admin Marketplace Routes — Barrel
 *
 * Aggregates admin-only marketplace oversight routes:
 * - Strategy vetting (pending list, approve/reject, audit trail)
 * - Dispute management (list, resolve, escalate)
 * - Revenue (platform overview, creator payouts)
 *
 * Route registration is delegated to focused sub-modules.
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { registerMarketplaceVettingRoutes } from './admin-marketplace-strategy-vetting-routes';
import { registerMarketplaceDisputeRoutes } from './admin-marketplace-dispute-routes';
import { registerMarketplaceRevenueRoutes } from './admin-marketplace-revenue-routes';

export const adminMarketplaceRouter: RouterType = Router();

registerMarketplaceVettingRoutes(adminMarketplaceRouter);
registerMarketplaceDisputeRoutes(adminMarketplaceRouter);
registerMarketplaceRevenueRoutes(adminMarketplaceRouter);

// Re-export schemas for external consumers (e.g., tests)
export { vettingDecisionSchema } from './admin-marketplace-strategy-vetting-routes';
export { resolveDisputeSchema, disputeFilterSchema } from './admin-marketplace-dispute-routes';
export { revenueFilterSchema } from './admin-marketplace-revenue-routes';
export { getTenantId, getUserId, isAdmin, getQueryString } from './admin-marketplace-helpers';

export default adminMarketplaceRouter;
