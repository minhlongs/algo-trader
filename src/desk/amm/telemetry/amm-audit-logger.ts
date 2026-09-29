/**
 * Cryptographic Hash-Chained Audit Logger
 * SHA-256 HMAC immutable audit trail for AMM pools, executions, and risk events
 * (Milestone 4 / Feature 14)
 */

import { createHmac } from 'crypto';
import { logger } from '../../../shared/utils/logger';
import {
  AmmAuditAction,
  AmmAuditRecord,
  AmmChainVerificationResult,
} from '../types/telemetry-types';

export class AmmAuditLogger {
  private hmacSecret: string;
  private chain: AmmAuditRecord[] = [];

  constructor(hmacSecret: string = 'amm-secret-audit-key-2026') {
    this.hmacSecret = hmacSecret;
  }

  public getChain(): readonly AmmAuditRecord[] {
    return this.chain;
  }

  public computeRecordHash(
    prevHash: string,
    index: number,
    timestamp: number,
    action: AmmAuditAction,
    details: Record<string, unknown>
  ): string {
    const payload = `${prevHash}:${index}:${timestamp}:${action}:${JSON.stringify(details)}`;
    return createHmac('sha256', this.hmacSecret).update(payload).digest('hex');
  }

  public logEvent(
    action: AmmAuditAction,
    details: Record<string, unknown>,
    poolId?: string
  ): AmmAuditRecord {
    const index = this.chain.length;
    const prevHash = index === 0 ? '0'.repeat(64) : this.chain[index - 1].hash;
    const timestamp = Date.now();
    const hash = this.computeRecordHash(prevHash, index, timestamp, action, details);

    const record: AmmAuditRecord = {
      index,
      sequenceNumber: index,
      timestamp,
      action,
      poolId,
      details,
      prevHash,
      previousHash: prevHash,
      hash,
    };

    this.chain.push(record);

    logger.debug('[AmmAuditLogger] Audit event recorded', {
      index,
      action,
      hashPrefix: hash.slice(0, 8),
    });

    return record;
  }

  public verifyChain(): AmmChainVerificationResult {
    if (this.chain.length === 0) {
      return { valid: true, totalRecords: 0 };
    }

    for (let i = 0; i < this.chain.length; i++) {
      const record = this.chain[i];

      // 1. Verify contiguous sequence index
      if (record.index !== i) {
        return {
          valid: false,
          totalRecords: this.chain.length,
          failedIndex: i,
          reason: `Non-contiguous sequence index: expected ${i}, found ${record.index}`,
        };
      }

      // 2. Verify prevHash alignment with previous record
      const expectedPrev = i === 0 ? '0'.repeat(64) : this.chain[i - 1].hash;
      if (record.prevHash !== expectedPrev) {
        return {
          valid: false,
          totalRecords: this.chain.length,
          failedIndex: i,
          reason: `prevHash mismatch at index ${i}: expected ${expectedPrev}, found ${record.prevHash}`,
        };
      }

      // 3. Recompute and verify HMAC cryptographic hash
      const recomputed = this.computeRecordHash(
        record.prevHash,
        record.index,
        record.timestamp,
        record.action,
        record.details
      );

      if (record.hash !== recomputed) {
        return {
          valid: false,
          totalRecords: this.chain.length,
          failedIndex: i,
          reason: `Cryptographic hash corruption at index ${i}: stored ${record.hash}, recomputed ${recomputed}`,
        };
      }

      // 4. Verify monotonic timestamp progression
      if (i > 0 && record.timestamp < this.chain[i - 1].timestamp) {
        return {
          valid: false,
          totalRecords: this.chain.length,
          failedIndex: i,
          reason: `Non-monotonic timestamp at index ${i}: ${record.timestamp} < ${this.chain[i - 1].timestamp}`,
        };
      }
    }

    return { valid: true, totalRecords: this.chain.length };
  }
}
