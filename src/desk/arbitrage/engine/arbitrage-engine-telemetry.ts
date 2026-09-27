/**
 * Prometheus metrics and hash-chained audit logging for the arbitrage engine.
 *
 * @module desk/arbitrage/engine/arbitrage-engine-telemetry
 */

import type { MultiLegExecutionReport } from '../execution-types';
import {
  type ArbitrageMetrics,
  recordArbOrder,
  recordArbLatency,
  recordArbPnl,
} from '../arbitrage-metrics';
import type { ArbitrageAuditLogger } from '../telemetry/arbitrage-audit-logger';

/**
 * Record Prometheus operational metrics for multi-leg execution outcomes.
 */
export function recordExecutionMetrics(
  report: MultiLegExecutionReport,
  metrics: ArbitrageMetrics,
  mode: 'dry-run' | 'live',
  buyVenue: string,
  sellVenue: string,
): void {
  for (const leg of report.legs) {
    metrics.recordOrder(leg.venue, leg.status, 'concurrent_arbitrage');
    metrics.recordExecutionLatency(leg.venue, 'concurrent_arbitrage', leg.latencyMs);
    recordArbOrder({
      strategyType: 'concurrent_arbitrage',
      venue: leg.venue,
      leg: leg.legId,
      side: leg.side,
      status: leg.status,
      mode,
    });
    recordArbLatency({
      strategyType: 'concurrent_arbitrage',
      phase: 'leg_fill',
      status: leg.status,
      latencyMs: leg.latencyMs,
    });
  }

  if (report.netRealizedPnlUsd !== undefined) {
    metrics.recordPnl('concurrent_arbitrage', report.netRealizedPnlUsd);
    recordArbPnl({
      strategyType: 'concurrent_arbitrage',
      venuePair: `${buyVenue}-${sellVenue}`,
      result: report.netRealizedPnlUsd >= 0 ? 'win' : 'loss',
      pnlUsd: report.netRealizedPnlUsd,
    });
  }
}

/**
 * Log terminal execution outcome into the cryptographic hash-chained audit trail.
 */
export async function logExecutionAuditOutcome(
  report: MultiLegExecutionReport,
  auditLogger: ArbitrageAuditLogger,
  metrics: ArbitrageMetrics,
  buyVenue: string,
): Promise<void> {
  if (report.state === 'FILLED') {
    await auditLogger.logOrderFilled(report);
    await auditLogger.logExecution(report);
  } else if (report.state === 'UNWOUND') {
    if (report.unwindResult) {
      metrics.recordUnwind(buyVenue, report.unwindResult.success);
      await auditLogger.logUnwind(report.executionId, report.unwindResult);
      await auditLogger.logOrderUnwound(report.unwindResult);
    }
    await auditLogger.logExecution(report);
  } else if (report.state === 'FAILED') {
    await auditLogger.logOrderFailed(report.executionId, report.error ?? 'Execution failed');
    await auditLogger.logExecution(report);
  }
}
