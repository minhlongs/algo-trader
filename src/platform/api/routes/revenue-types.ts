export interface RevenueSummary {
  period: string;
  mrr: number;
  arr: number;
  overageRevenue: number;
  totalRevenue: number;
  customerCount: number;
  averageRevenuePerCustomer: number;
  growthRate: number;
}

export interface CustomerUsage {
  licenseKey: string;
  tier: string;
  tradesUsed: number;
  tradesLimit: number;
  percentUsed: number;
  overageUnits: number;
  overageCost: number;
  lastActiveAt: number;
}

export interface ChurnMetrics {
  period: string;
  totalCustomers: number;
  churnedCustomers: number;
  churnRate: number;
  revenueChurn: number;
  reasons: Record<string, number>;
}

export interface MRRResponse {
  currentMRR: number;
  previousMRR: number;
  mrrGrowth: number;
  mrrGrowthRate: number;
  breakdown: {
    subscriptionMRR: number;
    overageMRR: number;
  };
}
