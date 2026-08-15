/**
 * Drawdown Monitor types
 * Extracted from drawdown-monitor.ts for modularity
 */

import type { IAuditEntry } from '../../seed/security/audit-log';
import { logAudit, hashIpAddress } from '../../seed/security/audit-log';
import { logger } from '../../shared/utils/logger';
import crypto from 'crypto';

export interface DrawdownConfig {
  maxDailyDrawdown: number;
  maxTotalDrawdown: number;
  maxConsecutiveLoss: number;
  haltOnBreach: boolean;
}

export interface DrawdownMetrics {
  currentDrawdown: number;
  maxDrawdown: number;
  peakValue: number;
  currentValue: number;
  dailyPnl: number;
  dailyDrawdown: number;
  consecutiveLosses: number;
  isHalted: boolean;
}

export interface DrawdownAlert {
  type: 'daily' | 'total' | 'consecutive';
  threshold: number;
  current: number;
  triggeredAt: number;
  message: string;
}

/** Write an audit entry for drawdown halt/resume events */
export async function writeDrawdownAudit(action: string, result: string, metadata: Record<string, unknown>): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: 'system',
    action,
    resource: 'Drawdown',
    result,
    metadata,
    ipHash: hashIpAddress(undefined),
    tenantId: 'system-tenant',
  } as IAuditEntry).catch((err) => logger.error(`[DrawdownMonitor] Failed to write audit:`, err));
}
