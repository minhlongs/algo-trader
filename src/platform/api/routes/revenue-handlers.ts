import { Router, Request, Response } from 'express';
import { UsageMeteringService } from '../../billing/usage-metering';
import { requireTier } from '../../middleware/feature-gate';
import { getCurrentPeriod, calculateMRR, calculateChurn } from './revenue-analytics';
import type { RevenueSummary, CustomerUsage } from './revenue-types';

export function registerRevenueRoutes(router: Router): void {
  const usageMetering = UsageMeteringService.getInstance();

  router.get('/summary', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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

  router.get('/mrr', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
    try {
      const mrrData = await calculateMRR();
      res.json(mrrData);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch MRR data',
      });
    }
  });

  router.get('/usage', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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

  router.get('/overage', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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

  router.get('/churn', requireTier('ENTERPRISE'), async (req: Request, res: Response) => {
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
}
