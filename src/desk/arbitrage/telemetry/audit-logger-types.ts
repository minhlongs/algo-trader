/**
 * Type definitions and parameter interfaces for ArbitrageAuditLogger.
 *
 * @module desk/arbitrage/telemetry/audit-logger-types
 */

import type { IAuditEntry } from '../../../seed/security/audit-log';

export interface ChainedAuditRow {
  sequenceNumber: number;
  hash: string;
  previousHash: string;
  entry: IAuditEntry;
  writtenToDb: boolean;
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAt?: number;
  reason?: string;
  totalRecords: number;
}

export interface OpportunityIngestionAuditParams {
  id: string;
  symbol?: string;
  buyVenue?: string;
  sellVenue?: string;
  buyPrice?: number;
  sellPrice?: number;
  spreadBps?: number;
  netProfitBps?: number;
  [key: string]: unknown;
}

export interface RiskRejectionAuditParams {
  opportunityId: string;
  reason: string;
  rule?: string;
  symbol?: string;
  details?: Record<string, unknown>;
  tenantId?: string;
}

export interface OrderSubmittedAuditParams {
  orderId: string;
  opportunityId?: string;
  symbol?: string;
  legsCount?: number;
  totalNotionalUsd?: number;
  executionMode?: string;
  legs?: unknown;
  [key: string]: unknown;
}
