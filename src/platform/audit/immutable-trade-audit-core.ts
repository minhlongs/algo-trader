/**
 * Core Immutable Trade Audit implementation.
 */

import * as fs from 'node:fs';
import { logger } from '../utils/logger';
import { appendJsonl, cashclawPath } from '../persistence/file-store';
import type {
  TradeAuditEventType,
  TradeAuditEntry,
  AuditTrailQuery,
} from './immutable-trade-audit-types';
import { computeTradeAuditHash } from './immutable-trade-audit-hash';

export class ImmutableTradeAudit {
  private entries: TradeAuditEntry[] = [];
  private sequenceCounter: number = 0;
  private readonly logPath: string;
  public writePromise: Promise<void> = Promise.resolve();

  constructor(logPath?: string) {
    this.logPath = logPath ?? cashclawPath('audit-log.jsonl');
    try {
      if (fs.existsSync(this.logPath)) {
        const content = fs.readFileSync(this.logPath, 'utf8');
        const existing = content
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => JSON.parse(line) as TradeAuditEntry);
        if (existing.length > 0) {
          this.entries = existing;
          this.sequenceCounter = existing[existing.length - 1].sequenceNumber;
          logger.info(`[TradeAudit] Restored ${existing.length} entries from ${this.logPath}`);
        }
      }
    } catch (err) {
      logger.warn('[TradeAudit] No existing log file found or failed to parse:', err);
    }
  }

  /** Append a new entry to the immutable log */
  append(
    eventType: TradeAuditEventType,
    reason: string,
    data?: Partial<Pick<TradeAuditEntry, 'walletLabel' | 'marketId' | 'signal' | 'kellySize' | 'actualSize' | 'price' | 'side' | 'metadata'>>
  ): TradeAuditEntry {
    const previousHash = this.entries.length > 0 ? this.entries[this.entries.length - 1].hash : '0';
    this.sequenceCounter++;

    const entry: Omit<TradeAuditEntry, 'hash'> & { hash?: string } = {
      id: `audit_${this.sequenceCounter}_${Date.now()}`,
      sequenceNumber: this.sequenceCounter,
      timestamp: new Date().toISOString(),
      eventType,
      reason,
      previousHash,
      ...data,
      hash: '',
    };

    entry.hash = this.computeHash(entry as TradeAuditEntry);
    const finalEntry = entry as TradeAuditEntry;
    this.entries.push(finalEntry);

    try {
      appendJsonl(this.logPath, finalEntry);
    } catch (err) {
      logger.error('[TradeAudit] Failed to append to log file:', err as Error);
    }

    logger.info(`[TradeAudit] #${finalEntry.sequenceNumber} ${eventType}: ${reason}`);
    return finalEntry;
  }

  /** Log a trade decision */
  logTradeDecision(
    marketId: string, side: 'buy' | 'sell', signal: string,
    kellySize: number, actualSize: number, walletLabel: string, reason: string
  ): TradeAuditEntry {
    return this.append('trade_decision', reason, {
      marketId, side, signal, kellySize, actualSize, walletLabel,
    });
  }

  /** Log a circuit breaker event */
  logCircuitBreaker(reason: string, metadata?: Record<string, unknown>): TradeAuditEntry {
    return this.append('circuit_breaker', reason, { metadata });
  }

  /** Log a drawdown tier change */
  logDrawdownTierChange(tier: string, drawdownPercent: number, portfolioValue: number): TradeAuditEntry {
    return this.append('drawdown_tier_change', `Tier changed to ${tier}`, {
      metadata: { tier, drawdownPercent, portfolioValue },
    });
  }

  /** Query the audit trail with filters (returns deep copies) */
  getAuditTrail(query?: AuditTrailQuery): TradeAuditEntry[] {
    let results = this.entries.map(e => ({ ...e }));
    if (query?.walletLabel) results = results.filter(e => e.walletLabel === query.walletLabel);
    if (query?.eventType) results = results.filter(e => e.eventType === query.eventType);
    if (query?.startDate) results = results.filter(e => e.timestamp >= query.startDate!);
    if (query?.endDate) results = results.filter(e => e.timestamp <= query.endDate!);
    if (query?.limit) results = results.slice(-query.limit);
    return results;
  }

  /** Verify the integrity of the entire hash chain */
  verifyChainIntegrity(): { valid: boolean; brokenAt?: number; reason?: string } {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (i === 0) {
        if (entry.previousHash !== '0') return { valid: false, brokenAt: i, reason: 'Genesis entry previousHash != 0' };
      } else if (entry.previousHash !== this.entries[i - 1].hash) {
        return { valid: false, brokenAt: i, reason: `previousHash mismatch at sequence ${entry.sequenceNumber}` };
      }
      const expectedHash = this.computeHash(entry);
      if (entry.hash !== expectedHash) {
        return { valid: false, brokenAt: i, reason: `Hash mismatch at sequence ${entry.sequenceNumber}` };
      }
    }
    return { valid: true };
  }

  /** Get total entry count */
  getEntryCount(): number {
    return this.entries.length;
  }

  /** Get the latest entry */
  getLatestEntry(): TradeAuditEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /** Compute SHA-256 hash for an entry (includes previousHash for chaining) */
  private computeHash(entry: TradeAuditEntry): string {
    return computeTradeAuditHash(entry);
  }
}
