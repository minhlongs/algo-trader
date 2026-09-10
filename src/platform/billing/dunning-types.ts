export type DunningStatus = 'active' | 'warning' | 'suspended' | 'reinstated';

export interface DunningRecord {
  id: string;
  licenseId: string;
  subscriptionId?: string;
  customerEmail: string;
  retryCount: number;
  lastAttemptDate: string;
  firstFailureDate: string;
  suspensionDate?: string;
  reinstatementDate?: string;
  status: DunningStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DunningConfig {
  enabled: boolean;
  maxRetries: number;
  gracePeriodDays: number;
}

export interface SuspensionStatusResult {
  isSuspended: boolean;
  status: DunningStatus;
  retryCount: number;
  daysUntilSuspension?: number;
  suspensionDate?: string;
}
