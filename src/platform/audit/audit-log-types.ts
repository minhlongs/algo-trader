/**
 * Audit Log Service Types.
 */

import type { BatchWriteEntry, BatchWriteResult } from './batch-writer';

export interface AuditLog {
  id: string;
  licenseId: string;
  event: AuditEventType;
  tier?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type AuditEventType =
  | 'created'
  | 'activated'
  | 'revoked'
  | 'api_call'
  | 'ml_feature'
  | 'rate_limit'
  | 'deleted'
  | 'suspension_warning'
  | 'suspended'
  | 'reinstated';

export interface AuditLogFilters {
  licenseId?: string;
  eventType?: AuditEventType | 'all';
  startDate?: string;
  endDate?: string;
  limit?: number;
  skip?: number;
}

export type { BatchWriteEntry, BatchWriteResult };
