import crypto from 'crypto';
import { logAudit, hashIpAddress } from '../../seed/security/audit-log';
import type { IAuditEntry } from '../../seed/security/audit-log';
import type { TenantId } from '../../shared/tenant';

export interface RateLimitAuditMetadata {
  tenantId: TenantId;
  tier: string;
  endpoint: string;
  remainingMs: number;
  retryAfter: number;
}

export async function emitRateLimitAuditEvent(
  params: RateLimitAuditMetadata,
): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: params.tenantId,
    action: 'rate_limit.exceeded',
    resource: 'RateLimit',
    result: 'denied',
    metadata: {
      tier: params.tier,
      endpoint: params.endpoint,
      remainingMs: params.remainingMs,
      retryAfter: params.retryAfter,
    },
    ipHash: hashIpAddress(undefined), // IP not available in this context
    tenantId: params.tenantId,
  } as IAuditEntry);
}

export interface CredentialDeletionAuditMetadata {
  tenantId: TenantId;
  actionBy: string;
  endpoint: string;
}

export async function emitCredentialDeletionAuditEvent(
  params: CredentialDeletionAuditMetadata,
): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: params.actionBy,
    action: 'credentials.deleted',
    resource: 'Credentials',
    result: 'success',
    metadata: {
      endpoint: params.endpoint,
    },
    ipHash: hashIpAddress(undefined),
    tenantId: params.tenantId,
  } as IAuditEntry);
}

export interface CredentialUpsertAuditMetadata {
  tenantId: TenantId;
  actionBy: string;
  endpoint: string;
}

export async function emitCredentialUpsertAuditEvent(
  params: CredentialUpsertAuditMetadata,
): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: params.actionBy,
    action: 'credentials.upsert',
    resource: 'Credentials',
    result: 'success',
    metadata: {
      endpoint: params.endpoint,
    },
    ipHash: hashIpAddress(undefined),
    tenantId: params.tenantId,
  } as IAuditEntry);
}

export interface TradeAuditMetadata {
  tenantId: string;
  actionBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function emitTradeAuditEvent(params: {
  eventType: 'trade_executed' | 'trade_rejected';
  tenantId: TenantId;
  actionBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: params.actionBy,
    action: params.eventType,
    resource: 'Trade',
    result: params.eventType === 'trade_executed' ? 'success' : 'denied',
    metadata: {
      reason: params.reason ?? params.eventType,
      ...params.metadata,
    },
    ipHash: hashIpAddress(undefined),
    tenantId: params.tenantId,
  } as IAuditEntry);
}

export interface ConfigAuditMetadata {
  tenantId: TenantId;
  actionBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function emitConfigAuditEvent(
  params: ConfigAuditMetadata,
): Promise<void> {
  await logAudit({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actor: params.actionBy,
    action: 'config.changed',
    resource: 'Config',
    result: 'success',
    metadata: {
      reason: params.reason ?? 'config_changed',
      ...params.metadata,
    },
    ipHash: hashIpAddress(undefined),
    tenantId: params.tenantId,
  } as IAuditEntry);
}