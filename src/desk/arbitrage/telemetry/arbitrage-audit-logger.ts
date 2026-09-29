/**
 * Cryptographically-verified SHA-256 HMAC hash-chained audit logger for arbitrage execution.
 *
 * Implements Milestone 4 (Requirement R4) audit logging:
 * - Integrates with unified audit log and computeRowHash
 * - Monotonic per-sequence HMAC-SHA256 chains linking each record to previousHash
 * - Dedicated lifecycle actions: arb.opportunity.ingested, arb.risk.rejected,
 *   arb.order.submitted, arb.order.filled, arb.order.unwound, arb.order.failed
 *
 * @module desk/arbitrage/telemetry/arbitrage-audit-logger
 */

import { logger } from '../../../shared/utils/logger';
import { logAudit, type AuditResult } from '../../../seed/security/audit-log';
import type { MultiLegExecutionReport, UnwindResult } from '../execution-types';
import type {
  ChainedAuditRow,
  ChainVerificationResult,
  OpportunityIngestionAuditParams,
  RiskRejectionAuditParams,
  OrderSubmittedAuditParams,
} from './audit-logger-types';
import {
  resolveIpHash,
  resolveAuditHmacKey,
  buildAuditRow,
  verifyAuditChainIntegrity,
} from './audit-logger-chain';
import {
  mapOpportunityIngestedMeta,
  mapRiskRejectedMeta,
  mapOrderSubmittedMeta,
  mapOrderFilledMeta,
  mapOrderUnwoundMeta,
  mapLegacyExecutionMeta,
  mapLegacyUnwindMeta,
} from './audit-logger-mappers';

export * from './audit-logger-types';
export * from './audit-logger-chain';
export * from './audit-logger-mappers';

export class ArbitrageAuditLogger {
  private readonly defaultIpHash: string;
  private readonly actor = 'algo-trader:arbitrage-engine';
  private readonly hmacKey: Buffer;
  private readonly chain: ChainedAuditRow[] = [];

  constructor(systemIp = '127.0.0.1', customKey?: Buffer) {
    this.defaultIpHash = resolveIpHash(systemIp);
    this.hmacKey = resolveAuditHmacKey(customKey);
  }

  private async appendRow(
    action: string,
    resource: string,
    result: AuditResult,
    metadata: Record<string, unknown>,
    tenantId = 'system',
    customTimestamp?: number | string,
  ): Promise<ChainedAuditRow> {
    const sequenceNumber = this.chain.length + 1;
    const previousHash = this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : '';
    const row = buildAuditRow({
      actor: this.actor,
      action,
      resource,
      result,
      metadata,
      ipHash: this.defaultIpHash,
      tenantId,
      customTimestamp,
      sequenceNumber,
      previousHash,
      hmacKey: this.hmacKey,
    });

    try {
      await logAudit(row.entry);
      row.writtenToDb = true;
    } catch (err: unknown) {
      logger.warn('[ArbitrageAuditLogger] DB write skipped (falling back to in-memory hash chain)', {
        action,
        resource,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.chain.push(row);
    return row;
  }

  async logOpportunityIngested(opp: OpportunityIngestionAuditParams, meta?: Record<string, unknown>): Promise<ChainedAuditRow> {
    const metadata = mapOpportunityIngestedMeta(opp, meta);
    return this.appendRow('arb.opportunity.ingested', `arbitrage/opportunity/${opp.id}`, 'success', metadata);
  }

  async logRiskRejected(params: RiskRejectionAuditParams): Promise<ChainedAuditRow> {
    const metadata = mapRiskRejectedMeta(params);
    logger.warn('[ArbitrageAuditLogger] Pre-trade risk rejection logged', { opportunityId: params.opportunityId, reason: params.reason, rule: params.rule });
    return this.appendRow('arb.risk.rejected', `arbitrage/opportunity/${params.opportunityId}`, 'denied', metadata, params.tenantId ?? 'system');
  }

  async logOrderSubmitted(order: OrderSubmittedAuditParams): Promise<ChainedAuditRow> {
    const metadata = mapOrderSubmittedMeta(order);
    logger.info('[ArbitrageAuditLogger] Arbitrage order submission logged', { orderId: order.orderId, opportunityId: order.opportunityId });
    return this.appendRow('arb.order.submitted', `arbitrage/order/${order.orderId}`, 'success', metadata);
  }

  async logOrderFilled(report: MultiLegExecutionReport | ({ executionId: string } & Record<string, unknown>)): Promise<ChainedAuditRow> {
    const metadata = mapOrderFilledMeta(report);
    logger.info('[ArbitrageAuditLogger] Arbitrage order fill logged', { executionId: report.executionId, netRealizedPnlUsd: metadata.netRealizedPnlUsd });
    return this.appendRow('arb.order.filled', `arbitrage/order/${report.executionId}`, 'success', metadata);
  }

  async logOrderUnwound(unwind: UnwindResult | ({ executionId?: string; unwindId?: string } & Record<string, unknown>)): Promise<ChainedAuditRow> {
    const { unwindId, executionId, success, metadata } = mapOrderUnwoundMeta(unwind);
    logger.warn('[ArbitrageAuditLogger] Compensatory unwind logged', { executionId, unwindId, success });
    return this.appendRow('arb.order.unwound', `arbitrage/unwind/${unwindId}`, success ? 'success' : 'failure', metadata);
  }

  async logOrderFailed(executionId: string, error: string, meta?: Record<string, unknown>): Promise<ChainedAuditRow> {
    logger.error('[ArbitrageAuditLogger] Order failure logged', { executionId, error });
    return this.appendRow('arb.order.failed', `arbitrage/order/${executionId}`, 'failure', { executionId, error, ...meta });
  }

  async logExecution(report: MultiLegExecutionReport, tenantId = 'system'): Promise<void> {
    const isSuccess = report.state === 'FILLED';
    const auditResult: AuditResult = isSuccess ? 'success' : report.state === 'UNWOUND' ? 'failure' : 'denied';
    const ts = report.timestamp ? new Date(report.timestamp).toISOString() : new Date().toISOString();
    await this.appendRow('arbitrage:trade_execution', `arbitrage/execution/${report.executionId}`, auditResult, mapLegacyExecutionMeta(report), tenantId, ts);
  }

  async logUnwind(executionId: string, unwind: { unwindId: string; success: boolean; unwoundLegs?: unknown[]; unwindCostUsd?: number; error?: string; timestamp?: number }, tenantId = 'system'): Promise<void> {
    const ts = unwind.timestamp ? new Date(unwind.timestamp).toISOString() : new Date().toISOString();
    await this.appendRow('arbitrage:compensatory_unwind', `arbitrage/unwind/${unwind.unwindId}`, unwind.success ? 'success' : 'failure', mapLegacyUnwindMeta(executionId, unwind), tenantId, ts);
  }

  async logRiskRejection(params: { opportunityId: string; reason: string; rule: string; tenantId?: string }): Promise<void> {
    logger.warn('[ArbitrageAuditLogger] Pre-trade risk rejection logged', { opportunityId: params.opportunityId, reason: params.reason, rule: params.rule });
    await this.appendRow('arbitrage:risk_rejection', `arbitrage/opportunity/${params.opportunityId}`, 'denied', { rule: params.rule, reason: params.reason }, params.tenantId ?? 'system');
  }

  getAuditHistory(): ChainedAuditRow[] {
    return [...this.chain];
  }

  getChain(): ChainedAuditRow[] {
    return [...this.chain];
  }

  getLastRecord(): ChainedAuditRow | undefined {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1] : undefined;
  }

  clear(): void {
    this.chain.length = 0;
  }

  verifyChainIntegrity(): ChainVerificationResult {
    return verifyAuditChainIntegrity(this.chain, this.hmacKey);
  }
}
