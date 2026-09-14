/**
 * Payout Scheduler Types
 *
 * Job payload and queue statistics types for referral commission payouts.
 */

export interface PayoutJobData {
  tenantId?: string; // Optional: if provided, only payout for this tenant
  periodStart?: string;
  periodEnd?: string;
  manual: boolean;
}

export interface PayoutQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}
