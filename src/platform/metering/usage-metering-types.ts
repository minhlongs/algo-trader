/**
 * Usage Metering Types & Constants.
 * ROIaaS Phase 4 - Daily API usage tracking and threshold alerts.
 */

import { LicenseTier } from '../../shared/types/license';

export interface UsageStatus {
  licenseKey: string;
  date: string;
  tier: LicenseTier;
  dailyLimit: number;
  currentUsage: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
  overageUnits: number;
  overageCost: number;
}

export interface ThresholdAlert {
  licenseKey: string;
  threshold: number;
  currentUsage: number;
  dailyLimit: number;
  percentUsed: number;
  timestamp: string;
}

export const DAILY_LIMITS: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 100,
  [LicenseTier.STARTER]: 1000,
  [LicenseTier.PRO]: 10000,
  [LicenseTier.ENTERPRISE]: 100000,
  [LicenseTier.MASTER]: 500000,
};

export const OVERAGE_PRICE_PER_CALL: Record<LicenseTier, number> = {
  [LicenseTier.FREE]: 0,
  [LicenseTier.STARTER]: 0.005,
  [LicenseTier.PRO]: 0.01,
  [LicenseTier.ENTERPRISE]: 0.005,
  [LicenseTier.MASTER]: 0.002,
};

export const ALERT_THRESHOLDS = [80, 90, 100];
