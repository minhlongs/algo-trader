/**
 * Cryptographically-verified SHA-256 HMAC hash-chained audit logger for arbitrage execution.
 *
 * Implements Milestone 4 (Requirement R4) audit logging:
 * - Integrates with unified audit log (src/seed/security/audit-log.ts) and computeRowHash (src/seed/security/audit-hash-chain.ts)
 * - Computes monotonic per-sequence HMAC-SHA256 chains linking each record to previousHash
 * - Provides audit actions for full lifecycle:
 *     arb.opportunity.ingested
 *     arb.risk.rejected
 *     arb.order.submitted
 *     arb.order.filled
 *     arb.order.unwound
 *     arb.order.failed
 * - In-memory fallback with genuine cryptographic chaining when PostgreSQL is unavailable or in unit tests
 *
 * @module desk/arbitrage/telemetry/arbitrage-audit-logger
 */

import crypto from 'node:crypto';
import { logger } from '../../../shared/utils/logger';
import {
  logAudit,
  hashIpAddress,
  type IAuditEntry,
  type AuditResult,
} from '../../../seed/security/audit-log';
import { computeRowHash } from '../../../seed/security/audit-hash-chain';
import { initHmacKey } from '../../../seed/security/audit-hmac-key';
import type { MultiLegExecutionReport, UnwindResult } from '../execution-types';

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

export class ArbitrageAuditLogger {
  private readonly defaultIpHash: string;
  private readonly actor = 'algo-trader:arbitrage-engine';
  private readonly hmacKey: Buffer;
  private readonly chain: ChainedAuditRow[] = [];

  constructor(systemIp = '127.0.0.1', customKey?: Buffer) {
    this.defaultIpHash =
      typeof hashIpAddress === 'function'
        ? hashIpAddress(systemIp)
        : crypto.createHash('sha256').update(systemIp).digest('hex');
    this.hmacKey = customKey ?? this.resolveHmacKey();
  }

  /**
   * Securely resolve HMAC key from environment or fallback to deterministic HMAC key
   * to guarantee cryptographic hash chaining in mock / non-Postgres environments.
   */
  private resolveHmacKey(): Buffer {
    const envKey = process.env.AUDIT_HMAC_KEY_v1;
    if (envKey && /^[0-9a-f]{64}$/i.test(envKey)) {
      try {
        return initHmacKey();
      } catch {
        // Fall back below if initialization fails
      }
    }
    // Cryptographically strong 32-byte deterministic fallback key for test / offline isolation
    return crypto
      .createHash('sha256')
      .update('algo-trader:arbitrage-audit-chain-default-key-v1')
      .digest();
  }

  /**
   * Core atomic entry appending logic. Computes SHA-256 HMAC hash chain,
   * assigns sequential monotonic number, attempts DB persistence, and records in-memory.
   */
  private async appendRow(
    action: string,
    resource: string,
    result: AuditResult,
    metadata: Record<string, unknown>,
    tenantId = 'system',
    customTimestamp?: number | string,
  ): Promise<ChainedAuditRow> {
    const tsString =
      typeof customTimestamp === 'string'
        ? customTimestamp
        : typeof customTimestamp === 'number'
          ? new Date(customTimestamp).toISOString()
          : new Date().toISOString();

    const entryId = `arb_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    const entry: IAuditEntry = {
      id: entryId,
      timestamp: tsString,
      actor: this.actor,
      action,
      resource,
      result,
      metadata,
      ipHash: this.defaultIpHash,
      tenantId,
    };

    const sequenceNumber = this.chain.length + 1;
    const previousHash =
      this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : '';

    const hash = computeRowHash(
      this.hmacKey,
      entry.tenantId,
      sequenceNumber,
      previousHash,
      entry,
    );

    let writtenToDb = false;
    try {
      await logAudit(entry);
      writtenToDb = true;
    } catch (err: unknown) {
      // In-memory fallback guarantee: non-Postgres environments still maintain real HMAC chain
      logger.warn('[ArbitrageAuditLogger] DB write skipped (falling back to in-memory hash chain)', {
        action,
        resource,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const row: ChainedAuditRow = {
      sequenceNumber,
      hash,
      previousHash,
      entry,
      writtenToDb,
    };

    this.chain.push(row);
    return row;
  }

  // ── Milestone 4 Explicit Lifecycle Action Loggers ──────────────────────────

  /**
   * 1. Log opportunity ingestion: arb.opportunity.ingested
   */
  async logOpportunityIngested(
    opp: OpportunityIngestionAuditParams,
    meta?: Record<string, unknown>,
  ): Promise<ChainedAuditRow> {
    const metadata: Record<string, unknown> = {
      opportunityId: opp.id,
      symbol: opp.symbol ?? 'unknown',
      buyVenue: opp.buyVenue ?? opp.buyExchange ?? 'unknown',
      sellVenue: opp.sellVenue ?? opp.sellExchange ?? 'unknown',
      buyPrice: opp.buyPrice,
      sellPrice: opp.sellPrice,
      spreadBps: opp.spreadBps,
      netProfitBps: opp.netProfitBps,
      ...meta,
    };

    return this.appendRow(
      'arb.opportunity.ingested',
      `arbitrage/opportunity/${opp.id}`,
      'success',
      metadata,
    );
  }

  /**
   * 2. Log pre-trade risk rejection: arb.risk.rejected
   */
  async logRiskRejected(
    params: RiskRejectionAuditParams,
  ): Promise<ChainedAuditRow> {
    const metadata: Record<string, unknown> = {
      opportunityId: params.opportunityId,
      reason: params.reason,
      rule: params.rule ?? 'RISK_GATE',
      symbol: params.symbol,
      details: params.details,
    };

    logger.warn('[ArbitrageAuditLogger] Pre-trade risk rejection logged', {
      opportunityId: params.opportunityId,
      reason: params.reason,
      rule: params.rule,
    });

    return this.appendRow(
      'arb.risk.rejected',
      `arbitrage/opportunity/${params.opportunityId}`,
      'denied',
      metadata,
      params.tenantId ?? 'system',
    );
  }

  /**
   * 3. Log multi-leg order submission: arb.order.submitted
   */
  async logOrderSubmitted(
    order: OrderSubmittedAuditParams,
  ): Promise<ChainedAuditRow> {
    const metadata: Record<string, unknown> = {
      orderId: order.orderId,
      opportunityId: order.opportunityId,
      symbol: order.symbol,
      legsCount: order.legsCount,
      totalNotionalUsd: order.totalNotionalUsd,
      executionMode: order.executionMode ?? 'concurrent',
    };

    logger.info('[ArbitrageAuditLogger] Arbitrage order submission logged', {
      orderId: order.orderId,
      opportunityId: order.opportunityId,
    });

    return this.appendRow(
      'arb.order.submitted',
      `arbitrage/order/${order.orderId}`,
      'success',
      metadata,
    );
  }

  /**
   * 4. Log multi-leg order fill: arb.order.filled
   */
  async logOrderFilled(
    report: MultiLegExecutionReport | ({ executionId: string } & Record<string, unknown>),
  ): Promise<ChainedAuditRow> {
    const reportObj = report as Record<string, unknown>;
    const metadata: Record<string, unknown> = {
      executionId: report.executionId,
      opportunityId: reportObj.opportunityId,
      state: reportObj.state ?? 'FILLED',
      netRealizedPnlUsd: reportObj.netRealizedPnlUsd ?? 0,
      latencyMs: reportObj.latencyMs ?? 0,
      legsCount: Array.isArray(reportObj.legs) ? reportObj.legs.length : 0,
    };

    logger.info('[ArbitrageAuditLogger] Arbitrage order fill logged', {
      executionId: report.executionId,
      netRealizedPnlUsd: metadata.netRealizedPnlUsd,
    });

    return this.appendRow(
      'arb.order.filled',
      `arbitrage/order/${report.executionId}`,
      'success',
      metadata,
    );
  }

  /**
   * 5. Log partial-fill compensatory unwind: arb.order.unwound
   */
  async logOrderUnwound(
    unwind: UnwindResult | ({ executionId?: string; unwindId?: string } & Record<string, unknown>),
  ): Promise<ChainedAuditRow> {
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
      unwoundLegsCount: Array.isArray(unwindObj.unwoundLegs) ? unwindObj.unwoundLegs.length : 0,
      error: unwindObj.error,
    };

    logger.warn('[ArbitrageAuditLogger] Compensatory unwind logged', {
      executionId,
      unwindId,
      success,
    });

    return this.appendRow(
      'arb.order.unwound',
      `arbitrage/unwind/${unwindId}`,
      success ? 'success' : 'failure',
      metadata,
    );
  }

  /**
   * 6. Log terminal order execution failure: arb.order.failed
   */
  async logOrderFailed(
    executionId: string,
    error: string,
    meta?: Record<string, unknown>,
  ): Promise<ChainedAuditRow> {
    const metadata: Record<string, unknown> = {
      executionId,
      error,
      ...meta,
    };

    logger.error('[ArbitrageAuditLogger] Order failure logged', {
      executionId,
      error,
    });

    return this.appendRow(
      'arb.order.failed',
      `arbitrage/order/${executionId}`,
      'failure',
      metadata,
    );
  }

  // ── Backward-Compatible Methods (for existing integration suites) ─────────

  async logExecution(
    report: MultiLegExecutionReport,
    tenantId = 'system',
  ): Promise<void> {
    const isSuccess = report.state === 'FILLED';
    const auditResult: AuditResult = isSuccess
      ? 'success'
      : report.state === 'UNWOUND'
        ? 'failure'
        : 'denied';

    const ts = report.timestamp ? new Date(report.timestamp).toISOString() : new Date().toISOString();

    await this.appendRow(
      'arbitrage:trade_execution',
      `arbitrage/execution/${report.executionId}`,
      auditResult,
      {
        executionId: report.executionId,
        opportunityId: report.opportunityId,
        state: report.state,
        latencyMs: report.latencyMs,
        realizedPnlUsd: report.netRealizedPnlUsd ?? 0,
        legsCount: report.legs ? report.legs.length : 0,
        error: report.error,
      },
      tenantId,
      ts,
    );
  }

  async logUnwind(
    executionId: string,
    unwind: { unwindId: string; success: boolean; unwoundLegs?: unknown[]; unwindCostUsd?: number; error?: string; timestamp?: number },
    tenantId = 'system',
  ): Promise<void> {
    const ts = unwind.timestamp ? new Date(unwind.timestamp).toISOString() : new Date().toISOString();
    await this.appendRow(
      'arbitrage:compensatory_unwind',
      `arbitrage/unwind/${unwind.unwindId}`,
      unwind.success ? 'success' : 'failure',
      {
        executionId,
        unwindCostUsd: unwind.unwindCostUsd,
        unwoundLegsCount: unwind.unwoundLegs ? unwind.unwoundLegs.length : 0,
        error: unwind.error,
      },
      tenantId,
      ts,
    );
  }

  async logRiskRejection(params: {
    opportunityId: string;
    reason: string;
    rule: string;
    tenantId?: string;
  }): Promise<void> {
    logger.warn('[ArbitrageAuditLogger] Pre-trade risk rejection logged', {
      opportunityId: params.opportunityId,
      reason: params.reason,
      rule: params.rule,
    });

    await this.appendRow(
      'arbitrage:risk_rejection',
      `arbitrage/opportunity/${params.opportunityId}`,
      'denied',
      {
        rule: params.rule,
        reason: params.reason,
      },
      params.tenantId ?? 'system',
    );
  }

  // ── Cryptographic Chain Inspection & Verification ──────────────────────────

  /**
   * Get all in-memory chained audit rows.
   */
  getAuditHistory(): ChainedAuditRow[] {
    return [...this.chain];
  }

  /**
   * Alias for getAuditHistory.
   */
  getChain(): ChainedAuditRow[] {
    return [...this.chain];
  }

  /**
   * Get the most recently recorded row.
   */
  getLastRecord(): ChainedAuditRow | undefined {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1] : undefined;
  }

  /**
   * Clear in-memory chain (for test isolation).
   */
  clear(): void {
    this.chain.length = 0;
  }

  /**
   * Cryptographically verify HMAC-SHA256 hash-chain integrity.
   * Asserts monotonic sequence, previous_hash linkage, and recomputed hash fidelity.
   */
  verifyChainIntegrity(): ChainVerificationResult {
    for (let i = 0; i < this.chain.length; i++) {
      const row = this.chain[i];
      const expectedSeq = i + 1;

      // 1. Monotonic sequence assertion
      if (row.sequenceNumber !== expectedSeq) {
        return {
          valid: false,
          brokenAt: row.sequenceNumber,
          reason: `Broken sequence: expected ${expectedSeq}, received ${row.sequenceNumber}`,
          totalRecords: this.chain.length,
        };
      }

      // 2. Previous hash chain linkage assertion
      const expectedPrevHash = i === 0 ? '' : this.chain[i - 1].hash;
      if (row.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          brokenAt: row.sequenceNumber,
          reason: `Previous hash mismatch at sequence ${row.sequenceNumber}`,
          totalRecords: this.chain.length,
        };
      }

      // 3. Recomputed HMAC-SHA256 signature verification
      const recomputed = computeRowHash(
        this.hmacKey,
        row.entry.tenantId,
        row.sequenceNumber,
        row.previousHash,
        row.entry,
      );

      if (recomputed !== row.hash) {
        return {
          valid: false,
          brokenAt: row.sequenceNumber,
          reason: `Cryptographic HMAC mismatch at sequence ${row.sequenceNumber}: row corrupted or tampered`,
          totalRecords: this.chain.length,
        };
      }
    }

    return {
      valid: true,
      totalRecords: this.chain.length,
    };
  }
}
