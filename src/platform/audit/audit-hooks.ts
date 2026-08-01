import { appendTenantAuditLog } from './tenant-audit-log';
import type { TenantAuditEventType } from './audit-event-types';
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
  await appendTenantAuditLog(
    params.tenantId,
    'rate_limit.exceeded',
    'system',
    `429 returned to ${params.endpoint}`,
    {
      endpoint: params.endpoint,
      tier: params.tier,
      remainingMs: params.remainingMs,
      retryAfter: params.retryAfter,
    },
  );
}

export interface CredentialDeletionAuditMetadata {
  tenantId: TenantId;
  actionBy: string;
  endpoint: string;
}

export async function emitCredentialDeletionAuditEvent(
  params: CredentialDeletionAuditMetadata,
): Promise<void> {
  await appendTenantAuditLog(
    params.tenantId,
    'credentials.deleted',
    params.actionBy,
    `Credentials deleted via ${params.endpoint}`,
    { endpoint: params.endpoint },
  );
}

export interface CredentialUpsertAuditMetadata {
  tenantId: TenantId;
  actionBy: string;
  endpoint: string;
}

export async function emitCredentialUpsertAuditEvent(
  params: CredentialUpsertAuditMetadata,
): Promise<void> {
  await appendTenantAuditLog(
    params.tenantId,
    'credentials.upsert',
    params.actionBy,
    `Credentials upserted via ${params.endpoint}`,
    { endpoint: params.endpoint },
  );
}

export interface TradeAuditMetadata {
  tenantId: string;
  actionBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function emitTradeAuditEvent(params: {
  eventType: Extract<
    TenantAuditEventType,
    'trade_executed' | 'trade_rejected'
  >;
  tenantId: TenantId;
  actionBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await appendTenantAuditLog(
    params.tenantId,
    params.eventType,
    params.actionBy,
    params.reason ?? params.eventType,
    params.metadata ?? {},
  );
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
  await appendTenantAuditLog(
    params.tenantId,
    'config_changed',
    params.actionBy,
    params.reason ?? 'config_changed',
    params.metadata ?? {},
  );
}
