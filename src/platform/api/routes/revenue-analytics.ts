import { revenueShareRepository } from '../../marketplace/repositories/revenue-share-repository';
import type { ChurnMetrics, MRRResponse } from './revenue-types';

export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function calculateMRR(): Promise<MRRResponse> {
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

export async function calculateChurn(period: string): Promise<ChurnMetrics> {
  const [yearStr, monthStr] = period.split('-');
  const monthStart = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const monthEnd = new Date(Number(yearStr), Number(monthStr), 0);

  const currentResult = await revenueShareRepository.findAll(
    { periodStart: monthStart, periodEnd: monthEnd },
    { page: 1, limit: 1000 },
  );

  const activeTenantIds = new Set(currentResult.data.map((r) => r.tenantId));
  const totalCustomers = activeTenantIds.size;

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
