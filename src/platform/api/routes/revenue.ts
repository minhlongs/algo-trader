/**
 * Revenue Analytics API Routes
 * Week 3-4: Billing - MRR, usage by customer, overage revenue, churn tracking
 *
 * Endpoints:
 * - GET /revenue/summary - Full revenue summary
 * - GET /revenue/mrr - Monthly Recurring Revenue
 * - GET /revenue/usage - Usage by customer
 * - GET /revenue/overage - Overage revenue
 * - GET /revenue/churn - Churn metrics
 */

import { Router } from 'express';
import { logger } from '../../../shared/utils/logger';
import { registerRevenueRoutes } from './revenue-handlers';

export const revenueRouter: Router = Router();
registerRevenueRoutes(revenueRouter);

logger.info('[RevenueRoutes] Registered');

export type { RevenueSummary, CustomerUsage, ChurnMetrics, MRRResponse } from './revenue-types';
export { getCurrentPeriod, calculateMRR, calculateChurn } from './revenue-analytics';
export { registerRevenueRoutes } from './revenue-handlers';
