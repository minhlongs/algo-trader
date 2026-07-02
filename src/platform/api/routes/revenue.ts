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

import { Router, Request, Response } from 'express';
import { UsageMeteringService } from '../../billing/usage-metering';
import { revenueShareRepository } from '../../marketplace/repositories/revenue-share-repository';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';

export const revenueRouter: Router = Router();
const usageMetering = UsageMeteringService.getInstance();

interface RevenueSummary {
  period: string;
  mrr: number;
  arr: number;
  overageRevenue: number;
  totalRevenue: number;
  customerCount: number;
  averageRevenuePerCustomer: number;
  growthRate: number;
}

interface CustomerUsage {
  licenseKey: string;
  tier: string;
  tradesUsed: number;
  tradesLimit: number;
  percentUsed: number;
  overageUnits: number;
  overageCost: number;
  lastActiveAt: number;
}

interface ChurnMetrics {
  period: string;
  totalCustomers: number;
  churnedCustomers: number;
  churnRate: number;
  revenueChurn: number;
  reasons: Record<string, number>;
}

interface MRRResponse {
  currentMRR: number;
  previousMRR: number;
  mrrGrowth: number;
  mrrGrowthRate: number;
  breakdown: {
    subscriptionMRR: number;
    overageMRR: number;
  };
}

/**
 * GET /revenue/summary
 * Get complete revenue analytics
 */
revenueRouter.get('/summary', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const period = getCurrentPeriod();
    const revenueSummary = await usageMetering.getRevenueSummary(period);
    const mrrData = await calculateMRR();

    const response: RevenueSummary = {
      period,
      mrr: mrrData.currentMRR,
      arr: mrrData.currentMRR * 12,
      overageRevenue: revenueSummary.overageRevenue,
      totalRevenue: revenueSummary.totalRevenue,
      customerCount: revenueSummary.customerCount,
      averageRevenuePerCustomer: revenueSummary.averageRevenuePerCustomer,
      growthRate: mrrData.mrrGrowthRate,
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch revenue summary',
    });
  }
});

/**
 * GET /revenue/mrr
 * Get MRR metrics
 */
revenueRouter.get('/mrr', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const mrrData = await calculateMRR();
    res.json(mrrData);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch MRR data',
    });
  }
});

/**
 * GET /revenue/usage
 * Get usage by customer
 */
revenueRouter.get('/usage', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || getCurrentPeriod();
    const limit = parseInt((req.query.limit as string) || '100');

    const usageData = await usageMetering.getAllUsageData(period);

    const customerUsage: CustomerUsage[] = usageData.slice(0, limit).map(usage => ({
      licenseKey: usage.licenseKey,
      tier: usage.tier,
      tradesUsed: usage.currentUsage,
      tradesLimit: usage.monthlyLimit,
      percentUsed: usage.percentUsed,
      overageUnits: usage.overageUnits,
      overageCost: usage.overageCost,
      lastActiveAt: usage.lastSyncedAt || 0,
    }));

    res.json({
      period,
      customers: customerUsage,
      total: usageData.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch usage data',
    });
  }
});

/**
 * GET /revenue/overage
 * Get overage revenue details
 */
revenueRouter.get('/overage', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || getCurrentPeriod();
    const revenueSummary = await usageMetering.getRevenueSummary(period);
    const usageData = await usageMetering.getAllUsageData(period);

    const overageCustomers = usageData
      .filter(u => u.overageUnits > 0)
      .map(u => ({
        licenseKey: u.licenseKey,
        overageUnits: u.overageUnits,
        overageCost: u.overageCost,
      }));

    res.json({
      period,
      totalOverageRevenue: revenueSummary.overageRevenue,
      customersWithOverage: overageCustomers.length,
      details: overageCustomers,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch overage data',
    });
  }
});

/**
 * GET /revenue/churn
 * Get churn metrics
 */
revenueRouter.get('/churn', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || getCurrentPeriod();
    const churnData = await calculateChurn(period);
    res.json(churnData);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch churn data',
    });
  }
});

/**
 * Helper functions
 */

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function calculateMRR(): Promise<MRRResponse> {
  // Query marketplace revenue shares for current month gross revenue
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [currentResult, previousResult] = await Promise.all([
    revenueShareRepository.findAll(
      { periodStart: monthStart, periodEnd: now },
      { page: 1, limit: 1000 },
    ),
    revenueShareRepository.findAll(
      { periodStart: prevMonthStart, periodEnd: monthStart },
      { page: 1, limit: 1000 },
    ),
  ]);

  const subscriptionMRR = currentResult.data.reduce((sum, r) => sum + r.grossRevenueCents, 0) / 100;
  const overageMRR = 0; // overage tracked separately in overage_invoices

  const previousMRR = previousResult.data.reduce((sum, r) => sum + r.grossRevenueCents, 0) / 100;
  const currentMRR = subscriptionMRR + overageMRR;

  return {
    currentMRR,
    previousMRR,
    mrrGrowth: currentMRR - previousMRR,
    mrrGrowthRate: previousMRR > 0 ? ((currentMRR - previousMRR) / previousMRR) * 100 : 0,
    breakdown: { subscriptionMRR, overageMRR },
  };
}

async function calculateChurn(period: string): Promise<ChurnMetrics> {
  // Count active marketplace subscriptions (approximation via revenue shares)
  const [yearStr, monthStr] = period.split('-');
  const monthStart = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const monthEnd = new Date(Number(yearStr), Number(monthStr), 0);

  const currentResult = await revenueShareRepository.findAll(
    { periodStart: monthStart, periodEnd: monthEnd },
    { page: 1, limit: 1000 },
  );

  const activeTenantIds = new Set(currentResult.data.map((r) => r.tenantId));
  const totalCustomers = activeTenantIds.size;

  // Churned: tenants with revenue in previous month but not current
  const prevMonthStart = new Date(Number(yearStr), Number(monthStr) - 2, 1);
  const prevMonthEnd = new Date(Number(yearStr), Number(monthStr) - 1, 0);
  const prevResult = await revenueShareRepository.findAll(
    { periodStart: prevMonthStart, periodEnd: prevMonthEnd },
    { page: 1, limit: 1000 },
  );

  const prevTenantIds = new Set(prevResult.data.map((r) => r.tenantId));
  const churnedCustomers = [...prevTenantIds].filter((id) => !activeTenantIds.has(id)).length;

  const churnRate = prevTenantIds.size > 0 ? (churnedCustomers / prevTenantIds.size) * 100 : 0;

  const currentRevenue = currentResult.data.reduce((sum, r) => sum + r.grossRevenueCents, 0) / 100;
  const prevRevenue = prevResult.data.reduce((sum, r) => sum + r.grossRevenueCents, 0) / 100;
  const revenueChurn = prevRevenue - currentRevenue;

  return { period, totalCustomers, churnedCustomers, churnRate, revenueChurn, reasons: {} };
}

logger.info('[RevenueRoutes] Registered');
