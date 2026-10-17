/**
 * Compliance Routes State & Validation Schema
 * Manages runtime rule toggle state, in-memory audit ring buffer, and request schema.
 */

import { z } from 'zod';
import { BUILT_IN_RULES } from '../../../desk/arbitrage/compliance/compliance-rules';
import type { ComplianceRule, AuditEntry } from '../../../desk/arbitrage/compliance/compliance-types';

const MAX_AUDIT_ENTRIES = 100;

export const ruleState: Map<string, boolean> = new Map(
  BUILT_IN_RULES.map(r => [r.id, r.enabled]),
);

export const auditLog: AuditEntry[] = [];

export function appendAudit(entry: AuditEntry): void {
  if (auditLog.length >= MAX_AUDIT_ENTRIES) {
    auditLog.shift();
  }
  auditLog.push(entry);
}

export function getActiveRules(): ComplianceRule[] {
  return BUILT_IN_RULES.filter(r => ruleState.get(r.id) === true);
}

export const validateBodySchema = z.object({
  pair: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  amount: z.number().positive(),
  price: z.number().positive(),
  counterparty: z.string().min(1),
  counterpartyDailyTotal: z.number().optional(),
  recentTrades: z.array(z.object({
    action: z.enum(['buy', 'sell']),
    timestamp: z.number(),
  })).optional(),
  destinationJurisdiction: z.string().optional(),
});
