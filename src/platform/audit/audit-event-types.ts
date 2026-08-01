// Tenant audit event types for the immutable audit log chain
// GENERATED: 2026-08-01 memoize review compliance audit hardening

export type TenantAuditEventType =
  | 'trade_executed'
  | 'trade_rejected'
  | 'config_changed'
  | 'rate_limit.exceeded'
  | 'credentials.upsert'
  | 'credentials.deleted';

export interface TradeAuditMetadata {
  tenantId: string;
  walletLabel?: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  qty?: number;
  price?: number;
  reason?: string;
  errorCode?: string;
}

export interface RateLimitAuditMetadata {
  tenantId: string;
  tier: string;
  endpoint: string;
  remainingMs: number;
  retryAfter: number;
}
