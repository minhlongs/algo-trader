// SPDX-License-Identifier: MIT
/**
 * Step 17: Immutable Compliance Audit Logger Facade
 * Wraps src/seed/security/audit-log.ts and provides in-memory SHA-256 hash-chained
 * compliance verification for automated trading desk operations.
 *
 * @module desk/security/audit-logger
 */

import crypto from 'node:crypto';
export {
  flushDeadLettersNow,
  getAuditHmacKeyVersion,
  getAuditTrail,
  getAuditTrailByTenant,
  getDeadLetterStatus,
  hashIpAddress,
  logAudit,
  verifyAuditChain,
  type AuditResult,
  type IAuditEntry,
} from '../../seed/security/audit-log';

export interface ChainedAuditRecord {
  readonly sequenceNumber: number;
  readonly tenantId: string;
  readonly action: string;
  readonly previousHash: string;
  readonly hash: string;
  readonly timestamp: number;
}

export class ComplianceAuditLogger {
  private chain: ChainedAuditRecord[] = [];

  public append(tenantId: string, action: string, timestamp = Date.now()): ChainedAuditRecord {
    const sequenceNumber = this.chain.length + 1;
    const previousHash = this.chain[this.chain.length - 1]?.hash ?? 'GENESIS';
    const payload = `${tenantId}|${sequenceNumber}|${previousHash}|${action}|${timestamp}`;
    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const record: ChainedAuditRecord = { sequenceNumber, tenantId, action, previousHash, hash, timestamp };
    this.chain.push(record);
    return record;
  }

  public verifyIntegrity(): boolean {
    return this.chain.every((item, i) => {
      const expectedPrev = i === 0 ? 'GENESIS' : (this.chain[i - 1]?.hash ?? '');
      const payload = `${item.tenantId}|${item.sequenceNumber}|${item.previousHash}|${item.action}|${item.timestamp}`;
      const expectedHash = crypto.createHash('sha256').update(payload).digest('hex');
      return item.previousHash === expectedPrev && item.hash === expectedHash;
    });
  }
}
