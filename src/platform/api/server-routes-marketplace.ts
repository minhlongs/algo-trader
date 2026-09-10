/**
 * Marketplace & Admin Marketplace Route Registrar
 */

import { Router, type Application } from 'express';
import { adminMarketplaceRouter } from './routes/admin-marketplace-routes';
import { registerMarketplaceDisputeRoutes } from './routes/admin-marketplace-dispute-routes';
import { registerMarketplaceRevenueRoutes } from './routes/admin-marketplace-revenue-routes';
import { registerMarketplaceVettingRoutes } from './routes/admin-marketplace-strategy-vetting-routes';
import { createAdminDnaRouter } from './routes/admin-dna-routes';
import { adminDnaRouter } from './routes/admin-dna';
import { marketplaceStrategyInsightsRouter } from './routes/marketplace-strategy-insights-routes';
import { marketplaceStrategyListingsRouter } from './routes/marketplace-strategy-listings-routes';
import { marketplaceStrategyManagementRouter } from './routes/marketplace-strategy-management-routes';
import { communityStrategyRouter } from './routes/community-strategy-routes';
import { subscriptionAnalyticsRouter } from './routes/subscription-analytics-routes';

export function registerMarketplaceRoutes(app: Application): void {
  // Admin marketplace routes
  app.use('/api/v1/admin/marketplace', adminMarketplaceRouter);

  const adminDisputeRouter = Router();
  registerMarketplaceDisputeRoutes(adminDisputeRouter);
  app.use('/api/v1/admin/marketplace/disputes', adminDisputeRouter);

  const adminRevenueRouter = Router();
  registerMarketplaceRevenueRoutes(adminRevenueRouter);
  app.use('/api/v1/admin/marketplace/revenue', adminRevenueRouter);

  const adminVettingRouter = Router();
  registerMarketplaceVettingRoutes(adminVettingRouter);
  app.use('/api/v1/admin/marketplace/vetting', adminVettingRouter);

  // Admin DNA routes
  app.use('/api/v1/admin/dna', createAdminDnaRouter());
  app.use('/api/v1/admin/dna-legacy', adminDnaRouter);

  // Marketplace routes
  app.use('/api/v1/marketplace/insights', marketplaceStrategyInsightsRouter);
  app.use('/api/v1/marketplace/listings', marketplaceStrategyListingsRouter);
  app.use('/api/v1/marketplace/management', marketplaceStrategyManagementRouter);
  app.use('/api/v1/marketplace/community', communityStrategyRouter);

  // Subscription analytics routes
  app.use('/api/v1/subscriptions/analytics', subscriptionAnalyticsRouter);
}
