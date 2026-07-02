/**
 * Subscription Analytics API Routes
 * Advanced revenue metrics: MRR breakdown, churn analysis, LTV prediction, cohort tracking.
 *
 * Endpoints:
 * - GET /analytics/subscription/dashboard   — Full subscription health dashboard
 * - GET /analytics/subscription/ltv         — LTV prediction by tier
 * - GET /analytics/subscription/cohorts     — Cohort retention analysis
 * - GET /analytics/subscription/churn       — Churn analysis with at-risk customers
 */

import { Router, Request, Response } from 'express';
import { LicenseService } from '../../billing/license-service';
import { SubscriptionService } from '../../billing/subscription-service';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import {
  calculateRevenueMetrics,
  buildCohortAnalysis,
  analyzeChurn,
  predictLTV,
} from '../../billing/revenue-analytics';
import type { License } from '../../../shared/types/license';

export const subscriptionAnalyticsRouter: Router = Router();

/** Fetch all licenses from the license service. */
async function getAllLicenses(): Promise<License[]> {
  const result = await LicenseService.getInstance().listLicenses({ take: 100000 });
  return result.licenses;
}

/**
 * GET /dashboard
 * Full subscription health dashboard: MRR, churn, LTV, ARPU, growth rate
 */
subscriptionAnalyticsRouter.get('/dashboard', requireTier('PRO'), async (_req: Request, res: Response) => {
  try {
    const licenses = await getAllLicenses();
    const subscriptions = await SubscriptionService.getInstance().getAllSubscriptions();

    const metrics = calculateRevenueMetrics(licenses, subscriptions);
    const withUsage = licenses.map((l) => ({
      licenseId: l.id,
      previousMonthUsage: l.usageCount,
      currentUsage: l.usageCount,
    }));
    const enrichedChurn = analyzeChurn(licenses, withUsage);

    res.json({
      period: new Date().toISOString().slice(0, 7),
      mrr: metrics.mrr,
      arr: metrics.arr,
      totalCustomers: metrics.totalCustomers,
      activeCustomers: metrics.activeCustomers,
      churnRate: metrics.churnRate,
      ltv: metrics.ltv,
      arpu: metrics.arpu,
      mrrGrowthRate: metrics.mrrGrowthRate,
      churnBreakdown: enrichedChurn.churnByTier,
      avgLifespanDays: enrichedChurn.avgLifespanDays,
      atRiskCount: enrichedChurn.atRiskCustomers.length,
    });
  } catch (error) {
    logger.error('[SubscriptionAnalytics] dashboard error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to compute subscription dashboard' });
  }
});

/**
 * GET /ltv
 * LTV prediction by tier with optional lifespan override
 */
subscriptionAnalyticsRouter.get('/ltv', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const licenses = await getAllLicenses();
    const lifespanDays = parseInt(req.query.lifespanDays as string, 10) || 365;

    const byTier: Record<string, number> = {};
    for (const t of ['FREE', 'PRO', 'ENTERPRISE', 'MASTER']) {
      const tierLicenses = licenses.filter((l) => l.tier === t);
      if (tierLicenses.length > 0) {
        const avgPrice = tierLicenses.reduce((s, l) => s + (l.maxUsage ?? 0), 0) / tierLicenses.length;
        byTier[t] = predictLTV(t, lifespanDays, avgPrice || 99);
      } else {
        byTier[t] = predictLTV(t, lifespanDays, 0);
      }
    }

    res.json({
      lifespanDays,
      byTier,
      recommended: byTier.PRO || 0,
      totalPortfolio: Object.values(byTier).reduce((s, v) => s + v, 0),
    });
  } catch (error) {
    logger.error('[SubscriptionAnalytics] ltv error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to compute LTV' });
  }
});

/**
 * GET /cohorts
 * Cohort retention and revenue analysis grouped by signup month
 */
subscriptionAnalyticsRouter.get('/cohorts', requireTier('PRO'), async (_req: Request, res: Response) => {
  try {
    const licenses = await getAllLicenses();
    const cohorts = buildCohortAnalysis(licenses);
    res.json({ cohorts });
  } catch (error) {
    logger.error('[SubscriptionAnalytics] cohorts error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to compute cohort analysis' });
  }
});

/**
 * GET /churn
 * Churn analysis with at-risk customer list
 */
subscriptionAnalyticsRouter.get('/churn', requireTier('PRO'), async (_req: Request, res: Response) => {
  try {
    const licenses = await getAllLicenses();
    const withUsage = licenses.map((l) => ({
      licenseId: l.id,
      previousMonthUsage: l.usageCount,
      currentUsage: l.usageCount,
    }));
    const churn = analyzeChurn(licenses, withUsage);

    res.json({
      currentMonthChurn: churn.currentMonthChurn,
      churnByTier: churn.churnByTier,
      avgLifespanDays: churn.avgLifespanDays,
      atRiskCustomerCount: churn.atRiskCustomers.length,
      atRiskCustomerIds: churn.atRiskCustomers.slice(0, 50),
    });
  } catch (error) {
    logger.error('[SubscriptionAnalytics] churn error:', { error: String(error) });
    res.status(500).json({ error: 'Failed to compute churn analysis' });
  }
});
