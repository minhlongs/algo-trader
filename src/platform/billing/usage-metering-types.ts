/**
 * Usage Metering — shared types and tier limit constants.
 * Extracted from usage-metering.ts to keep every module under the line limit.
 */

import { LicenseTier } from '../../shared/types/license';

export interface UsageStatus {
  licenseKey: string;
  period: string; // YYYY-MM format
  tier: LicenseTier;
  monthlyLimit: number;
  currentUsage: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
  overageUnits: number;
  overageCost: number;
  lastSyncedAt?: number;
}

export interface UsageMetrics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  averageTradeSize: number;
}

export interface OverageCharge {
  licenseKey: string;
  period: string;
  units: number;
  pricePerUnit: number;
  totalCost: number;
  status: 'pending' | 'billed' | 'paid';
}

export const MONTHLY_LIMITS: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 1000,      // 1k trades/month
  [LicenseTier.STARTER]: 5000,   // 5k trades/month
  [LicenseTier.PRO]: 10000,      // 10k trades/month
  [LicenseTier.ENTERPRISE]: 100000, // 100k trades/month
  [LicenseTier.MASTER]: 500000,  // 500k trades/month
};

export const OVERAGE_PRICE_PER_TRADE: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 0,         // No overage for FREE (hard limit)
  [LicenseTier.STARTER]: 0,      // No overage for STARTER (hard limit)
  [LicenseTier.PRO]: 0.01,       // $0.01 per extra trade
  [LicenseTier.ENTERPRISE]: 0.005, // $0.005 per extra trade
  [LicenseTier.MASTER]: 0.001,   // $0.001 per extra trade
};

export const ALERT_THRESHOLDS = [80, 90, 100];
