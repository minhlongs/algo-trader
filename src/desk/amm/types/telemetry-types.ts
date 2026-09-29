/**
 * Telemetry & Cryptographic Audit Types
 * Prometheus Metrics & SHA-256 HMAC Audit Logging
 * (Milestone 4 / Features 13 & 14)
 */

export type AmmAuditAction =
  | 'POOL_INIT'
  | 'POOL_INITIALIZED'
  | 'SWAP'
  | 'BUY'
  | 'SELL'
  | 'TRADE_EXECUTED'
  | 'MINT_COMPLETE_SET'
  | 'MERGE_COMPLETE_SET'
  | 'ADD_LIQUIDITY'
  | 'REMOVE_LIQUIDITY'
  | 'DYNAMIC_B_UPDATE'
  | 'ARBITRAGE_DETECTED'
  | 'ARBITRAGE_EXECUTED'
  | 'BASKET_ARBITRAGE_DETECTED'
  | 'BUNDLE_SUBMITTED'
  | 'BUNDLE_FILLED'
  | 'PARTIAL_UNWIND_TRIGGERED'
  | 'PARTIAL_UNWIND_COMPLETED'
  | 'UNWIND_EXECUTED'
  | 'QUOTE_PUBLISHED'
  | 'DEFENSIVE_TRIPWIRE_TRIGGERED'
  | 'REBALANCE_DISPATCHED'
  | 'RISK_GATE_APPROVED'
  | 'RISK_GATE_REJECTED'
  | 'RISK_REJECTED'
  | 'CIRCUIT_BREAKER_TRIPPED';

export interface AmmAuditRecord {
  index: number;
  sequenceNumber?: number;
  timestamp: number;
  action: AmmAuditAction;
  poolId?: string;
  details: Record<string, unknown>;
  prevHash: string;
  previousHash?: string;
  hash: string;
}

export interface AmmChainVerificationResult {
  valid: boolean;
  totalRecords?: number;
  failedIndex?: number;
  reason?: string;
}

export interface AmmMetricsSnapshot {
  liquidityDepthUsd: number;
  tradeVolumeUsd: number;
  arbitragePnlUsd: number;
  vpinToxicity: number;
  tripwireActivations?: number;
  circuitBreakerTripped?: boolean;
  activePoolsCount?: number;
  timestampMs?: number;
}
