/**
 * Immutable Trade Audit Log (Barrel Facade)
 * Append-only log with SHA-256 hash chain for tamper detection.
 * Every trade decision, circuit breaker event, and drawdown tier change is logged.
 */

export type {
  TradeAuditEventType,
  TradeAuditEntry,
  AuditTrailQuery,
} from './immutable-trade-audit-types';

export { computeTradeAuditHash } from './immutable-trade-audit-hash';

export { ImmutableTradeAudit } from './immutable-trade-audit-core';
