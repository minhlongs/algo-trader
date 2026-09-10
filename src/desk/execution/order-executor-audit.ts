/**
 * Order Executor Audit - Audit logging for order execution events
 */
import { logger } from '../utils/logger';
import { logAudit, hashIpAddress } from '../../seed/security/audit-log';
import type { IAuditEntry } from '../../seed/security/audit-log';
import type { ExecutionResult } from './order-executor-types';

export async function logOrderAudit(execution: ExecutionResult): Promise<void> {
  try {
    await logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'system',
      action: 'order_executed',
      resource: 'Order',
      result: execution.status === 'FILLED' ? 'success' : 'failure',
      metadata: {
        executionId: execution.id,
        opportunityId: execution.opportunityId,
        status: execution.status,
        profit: execution.profit,
        error: execution.error,
        buyOrder: execution.buyOrder,
        sellOrder: execution.sellOrder,
      },
      ipHash: hashIpAddress(undefined),
      tenantId: 'system-tenant',
    } as IAuditEntry);
  } catch (err) {
    logger.error('[OrderExecutor] Failed to append tenant audit log:', err);
  }
}
