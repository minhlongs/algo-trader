/**
 * Cryptographic hash computation for trade audit entries.
 */

import { createHash } from 'crypto';
import type { TradeAuditEntry } from './immutable-trade-audit-types';

/** Compute SHA-256 hash for an entry (includes previousHash for chaining) */
export function computeTradeAuditHash(entry: TradeAuditEntry): string {
  const payload = JSON.stringify({
    id: entry.id,
    sequenceNumber: entry.sequenceNumber,
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    walletLabel: entry.walletLabel,
    marketId: entry.marketId,
    signal: entry.signal,
    kellySize: entry.kellySize,
    actualSize: entry.actualSize,
    price: entry.price,
    side: entry.side,
    reason: entry.reason,
    metadata: entry.metadata,
    previousHash: entry.previousHash,
  });

  return createHash('sha256').update(payload).digest('hex');
}
