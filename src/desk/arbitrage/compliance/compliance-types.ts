/**
 * Compliance Types and Interfaces
 *
 * Type definitions for regulatory compliance validation system.
 */

export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ComplianceStatus = 'pending' | 'approved' | 'blocked' | 'review';

export interface ComplianceResult {
  passed: boolean;
  ruleId: string;
  message: string;
  severity: ComplianceSeverity;
  timestamp: number;
}

export interface ComplianceContext {
  tradeId: string;
  asset: string;
  counterparty: string;
  amount: number;
  price: number;
  side: 'buy' | 'sell';
  jurisdiction: string;
  timestamp: number;
  pair?: string;
  counterpartyDailyTotal?: number;
  recentTrades?: Array<{ action: 'buy' | 'sell'; timestamp: number }>;
  destinationJurisdiction?: string;
}

export interface AuditEntry {
  id?: string;
  tradeId?: string;
  ruleId: string;
  result?: ComplianceResult;
  checkedAt?: number;
  checker?: string;
  action?: string;
  pair?: string;
  side?: string;
  amount?: number;
  counterparty?: string;
  reason?: string;
  timestamp?: number;
}

export interface PositionLimits {
  asset: string;
  maxPosition: number;
  maxDailyVolume: number;
  maxCounterpartyExposure: number;
}

export interface ComplianceConfig {
  enabled: boolean;
  jurisdiction: string;
  strictMode: boolean;
  dryRun: boolean;
}

export interface SanctionsEntry {
  id: string;
  name: string;
  type: 'entity' | 'individual' | 'wallet';
  list: 'OFAC' | 'UN' | 'EU';
  addedAt: string;
  reason: string;
}

export interface ComplianceViolation extends AuditEntry {
  action: 'blocked' | 'warned' | 'reported';
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  validate: (context: ComplianceContext) => ComplianceResult;
}
