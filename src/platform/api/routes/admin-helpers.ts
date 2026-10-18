/**
 * Admin Route Validation, Audit, and Formatting Helpers
 */

import crypto from 'crypto';
import { z } from 'zod';
import type { CircuitStatus } from '../../../desk/risk/circuit-breaker';
import { logAudit, hashIpAddress, type IAuditEntry } from '../../../seed/security/audit-log';

export const haltSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500, 'Reason too long'),
});

export const resetBreakerNameSchema = z.object({
  name: z.string().min(1),
});

export async function logAdminTradingAudit(
  action: 'admin_halt' | 'admin_resume',
  metadata: Record<string, unknown>,
): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: 'admin',
    action,
    resource: 'Trading',
    result: 'success',
    metadata,
    ipHash: hashIpAddress(undefined),
    tenantId: 'system-tenant',
  } as IAuditEntry);
}

export function formatAdminStatusPayload<T extends { isHalted: boolean }>(
  circuitStatus: CircuitStatus,
  drawdownMetrics: T,
) {
  return {
    trading: circuitStatus.state === 'CLOSED' && !drawdownMetrics.isHalted,
    circuitBreaker: circuitStatus,
    drawdown: drawdownMetrics,
    timestamp: Date.now(),
  };
}

export function extractAdminErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
