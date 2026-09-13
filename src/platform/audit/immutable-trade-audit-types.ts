/**
 * Types for immutable trade audit log.
 */

export type TradeAuditEventType =
  | 'trade_decision'
  | 'trade_executed'
  | 'trade_rejected'
  | 'circuit_breaker'
  | 'drawdown_tier_change'
  | 'kelly_sizing'
  | 'twap_chunk'
  | 'wallet_trade'
  | 'manual_override';

export interface TradeAuditEntry {
  id: string;
  sequenceNumber: number;
  timestamp: string;
  eventType: TradeAuditEventType;
  walletLabel?: string;
  marketId?: string;
  signal?: string;
  kellySize?: number;
  actualSize?: number;
  price?: number;
  side?: 'buy' | 'sell';
  reason: string;
  metadata?: Record<string, unknown>;
  /** SHA-256 hash of this entry (includes previous hash for chain) */
  hash: string;
  /** Hash of the previous entry (genesis entry has '0') */
  previousHash: string;
}

export interface AuditTrailQuery {
  walletLabel?: string;
  eventType?: TradeAuditEventType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
