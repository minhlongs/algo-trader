/**
 * Marketplace Strategy Routes (Facade)
 * Composes sub-routers for listings, management, and insights.
 *
 * Endpoints:
 * - GET    /api/v1/marketplace/strategies              — List published strategies
 * - POST   /api/v1/marketplace/strategies/publish      — Create/publish strategy
 * - GET    /api/v1/marketplace/strategies/:id          — Get strategy details
 * - PATCH  /api/v1/marketplace/strategies/:id          — Update strategy
 * - POST   /api/v1/marketplace/strategies/:id/vetting/request — Submit for vetting
 * - GET    /api/v1/marketplace/strategies/:id/performance    — Get performance
 * - GET    /api/v1/marketplace/strategies/:id/reviews        — Get reviews
 */

import { Router } from 'express';
import type { Router as RouterType } from 'express';
import { marketplaceStrategyListingsRouter } from './marketplace-strategy-listings-routes';
import { marketplaceStrategyManagementRouter } from './marketplace-strategy-management-routes';
import { marketplaceStrategyInsightsRouter } from './marketplace-strategy-insights-routes';

export const marketplaceStrategyRouter: RouterType = Router();

marketplaceStrategyRouter.use(marketplaceStrategyListingsRouter);
marketplaceStrategyRouter.use(marketplaceStrategyManagementRouter);
marketplaceStrategyRouter.use(marketplaceStrategyInsightsRouter);

export default marketplaceStrategyRouter;
