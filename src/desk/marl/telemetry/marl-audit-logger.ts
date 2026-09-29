/**
 * Cryptographically-verified SHA-256 HMAC hash-chained audit logger for MARL.
 *
 * Implements tamper-evident audit logging for quoting, hedging, risk gates,
 * and microstructure toxicity tripwires.
 *
 * @module desk/marl/telemetry/marl-audit-logger
 */

import { createHmac } from 'node:crypto';
import { logger } from '../../../shared/utils/logger';

export type MarlAuditAction =
  | 'marl.quote.posted'
  | 'marl.quote.canceled'
  | 'marl.fill.received'
  | 'marl.hedge.submitted'
  | 'marl.hedge.filled'
  | 'marl.hedge.unwound'
  | 'marl.toxicity.widened'
  | 'marl.tripwire.activated'
  | 'marl.risk.rejected';

export interface MarlAuditRecord {
  sequenceNumber: number;
  timestamp: number;
  actor: string;
  action: MarlAuditAction;
  payload: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export interface MarlChainVerificationResult {
  valid: boolean;
  brokenAt?: number;
  total: number;
}

export class MarlAuditLogger {
  private readonly chain: MarlAuditRecord[] = [];
  private readonly secret: string;
  private readonly actor = 'algo-trader:marl-engine';

  constructor(secretKey = 'algo-trader-marl-audit-hmac-v1') {
    this.secret = secretKey;
  }

  public logAction(action: MarlAuditAction, details: Record<string, unknown>): MarlAuditRecord {
    const sequenceNumber = this.chain.length;
    const previousHash =
      sequenceNumber === 0
        ? '0000000000000000000000000000000000000000000000000000000000000000'
        : this.chain[sequenceNumber - 1].hash;

    const timestamp = Date.now();
    const dataToHash = `${previousHash}:${sequenceNumber}:${action}:${timestamp}:${JSON.stringify(details)}`;
    const hash = createHmac('sha256', this.secret).update(dataToHash).digest('hex');

    const record: MarlAuditRecord = {
      sequenceNumber,
      timestamp,
      actor: this.actor,
      action,
      payload: details,
      previousHash,
      hash,
    };

    if (action === 'marl.risk.rejected' || action === 'marl.tripwire.activated') {
      logger.warn('[MarlAuditLogger] High-priority audit event recorded', {
        action,
        sequenceNumber,
        details,
      });
    } else {
      logger.info('[MarlAuditLogger] MARL audit event recorded', {
        action,
        sequenceNumber,
      });
    }

    this.chain.push(record);
    return record;
  }

  public verifyChain(): MarlChainVerificationResult {
    for (let i = 0; i < this.chain.length; i++) {
      const current = this.chain[i];
      const expectedPrev =
        i === 0
          ? '0000000000000000000000000000000000000000000000000000000000000000'
          : this.chain[i - 1].hash;

      if (current.previousHash !== expectedPrev) {
        return { valid: false, brokenAt: i, total: this.chain.length };
      }

      const dataToHash = `${current.previousHash}:${current.sequenceNumber}:${current.action}:${current.timestamp}:${JSON.stringify(current.payload)}`;
      const recomputedHash = createHmac('sha256', this.secret).update(dataToHash).digest('hex');
      if (current.hash !== recomputedHash) {
        return { valid: false, brokenAt: i, total: this.chain.length };
      }
    }
    return { valid: true, total: this.chain.length };
  }

  public getRecords(): MarlAuditRecord[] {
    return [...this.chain];
  }

  public getLastRecord(): MarlAuditRecord | undefined {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1] : undefined;
  }
}
