/**
 * Circuit Breaker Audit Logging Helpers
 */

import crypto from 'crypto';
import { logger } from '../../shared/utils/logger';
import { logAudit, hashIpAddress, type IAuditEntry } from '../../seed/security/audit-log';

export async function logCircuitBreakerTripped(
  reason: string,
  details?: string,
  triggeredAt?: number
): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: 'system',
    action: 'circuit_breaker_tripped',
    resource: 'CircuitBreaker',
    result: 'failure',
    metadata: {
      details,
      state: 'OPEN',
      triggeredAt,
      reason,
    },
    ipHash: hashIpAddress(undefined),
    tenantId: 'system-tenant',
  } as IAuditEntry).catch((err) =>
    logger.error('[CircuitBreaker] Failed to append tenant audit log:', err)
  );
}

export async function logCircuitBreakerReset(): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: 'system',
    action: 'circuit_breaker_reset',
    resource: 'CircuitBreaker',
    result: 'success',
    metadata: {
      state: 'CLOSED',
    },
    ipHash: hashIpAddress(undefined),
    tenantId: 'system-tenant',
  } as IAuditEntry).catch((err) =>
    logger.error('[CircuitBreaker] Failed to append tenant audit log:', err)
  );
}
