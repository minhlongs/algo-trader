/**
 * Metadata mappers for ArbitrageAuditLogger events.
 *
 * @module desk/arbitrage/telemetry/audit-logger-mappers
 */

import type { MultiLegExecutionReport, UnwindResult } from '../execution-types';
import type {
  OpportunityIngestionAuditParams,
  RiskRejectionAuditParams,
  OrderSubmittedAuditParams,
} from './audit-logger-types';

export function mapOpportunityIngestedMeta(
  opp: OpportunityIngestionAuditParams,
  meta?: Record<string, unknown>,
): Record<string, unknown> {
  const oppAny = opp as Record<string, unknown>;
  return {
    opportunityId: opp.id,
    symbol: opp.symbol ?? 'unknown',
    buyVenue: opp.buyVenue ?? oppAny.buyExchange ?? 'unknown',
    sellVenue: opp.sellVenue ?? oppAny.sellExchange ?? 'unknown',
    buyPrice: opp.buyPrice,
    sellPrice: opp.sellPrice,
    spreadBps: opp.spreadBps,
    netProfitBps: opp.netProfitBps,
    ...meta,
  };
}

export function mapRiskRejectedMeta(
  params: RiskRejectionAuditParams,
): Record<string, unknown> {
  return {
    opportunityId: params.opportunityId,
    reason: params.reason,
    rule: params.rule ?? 'RISK_GATE',
    symbol: params.symbol,
    details: params.details,
  };
}

export function mapOrderSubmittedMeta(
  order: OrderSubmittedAuditParams,
): Record<string, unknown> {
  return {
    orderId: order.orderId,
    opportunityId: order.opportunityId,
    symbol: order.symbol,
    legsCount: order.legsCount,
    totalNotionalUsd: order.totalNotionalUsd,
    executionMode: order.executionMode ?? 'concurrent',
  };
}

export function mapOrderFilledMeta(
  report: MultiLegExecutionReport | ({ executionId: string } & Record<string, unknown>),
): Record<string, unknown> {
  const reportObj = report as Record<string, unknown>;
  return {
    executionId: report.executionId,
    opportunityId: reportObj.opportunityId,
    state: reportObj.state ?? 'FILLED',
    netRealizedPnlUsd: reportObj.netRealizedPnlUsd ?? 0,
    latencyMs: reportObj.latencyMs ?? 0,
    legsCount: Array.isArray(reportObj.legs) ? reportObj.legs.length : 0,
  };
}

export function mapOrderUnwoundMeta(
  unwind: UnwindResult | ({ executionId?: string; unwindId?: string } & Record<string, unknown>),
): {
  unwindId: string;
  executionId: string;
  success: boolean;
  metadata: Record<string, unknown>;
} {
  const unwindObj = unwind as Record<string, unknown>;
  const unwindId =
    typeof unwindObj.unwindId === 'string'
      ? unwindObj.unwindId
      : `unwind_${Date.now()}`;
  const executionId =
    typeof unwindObj.executionId === 'string'
      ? unwindObj.executionId
      : unwindId;
  const success = Boolean(unwind.success);

  const metadata: Record<string, unknown> = {
    executionId,
    unwindId,
    success,
    unwindCostUsd: unwindObj.unwindCostUsd ?? 0,
    unhedgedResidualDelta: unwindObj.unhedgedResidualDelta ?? 0,
    unwoundLegsCount: Array.isArray(unwoundLegsCount(unwindObj.unwoundLegs))
      ? (unwindObj.unwoundLegs as unknown[]).length
      : 0,
    error: unwindObj.error,
  };

  return { unwindId, executionId, success, metadata };
}

function unwoundLegsCount(legs: unknown): unknown[] | null {
  return Array.isArray(legs) ? legs : null;
}

export function mapLegacyExecutionMeta(report: MultiLegExecutionReport): Record<string, unknown> {
  return {
    executionId: report.executionId,
    opportunityId: report.opportunityId,
    state: report.state,
    latencyMs: report.latencyMs,
    realizedPnlUsd: report.netRealizedPnlUsd ?? 0,
    legsCount: report.legs ? report.legs.length : 0,
    error: report.error,
  };
}

export function mapLegacyUnwindMeta(
  executionId: string,
  unwind: { unwindId: string; success: boolean; unwoundLegs?: unknown[]; unwindCostUsd?: number; error?: string },
): Record<string, unknown> {
  return {
    executionId,
    unwindCostUsd: unwind.unwindCostUsd,
    unwoundLegsCount: unwind.unwoundLegs ? unwind.unwoundLegs.length : 0,
    error: unwind.error,
  };
}
