/**
 * Audit Log Service
 * ROIaaS Phase 6 + P1 DB persistence + immutability
 *
 * All reads/writes go through the seed-layer DB primitives.
 * In-memory Maps removed; PostgreSQL is the single source of truth.
 */

import { config } from '../../shared/config/env';
import { query } from '../../db/postgres-client.js';
import { logAudit } from '../../seed/security/audit-log';
import type { IAuditEntry } from '../../seed/security/audit-log';
import { hashIpAddress } from '../../seed/security/audit-ip-hash';
import { AuditLogExporter } from './exporters';
import { AuditLogValidators } from './validators';
import { AuditLogBatchWriter, type BatchWriteEntry, type BatchWriteResult } from './batch-writer';
import type { AuditLog, AuditEventType, AuditLogFilters } from './audit-log-types';
import { executeGetExpiredLogIds, executeCleanupExpiredLogs } from './audit-log-db-cleanup';

export * from './audit-log-types';

const SELECT_BY_LICENSE_SQL = `
  SELECT id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
  FROM audit_log
  WHERE tenant_id = $1
  ORDER BY "timestamp" DESC
  LIMIT $2
`;

const SELECT_ALL_SQL = `
  SELECT id, "timestamp", actor, action, resource, result, metadata, ip_hash, tenant_id
  FROM audit_log
  ORDER BY "timestamp" DESC
  LIMIT $1
`;

export class AuditLogService {
  private static instance: AuditLogService | null = null;
  private retentionDays: number;
  private batchSize: number;

  private constructor() {
    this.retentionDays = parseInt(config.AUDIT_RETENTION_DAYS || '90', 10);
    this.batchSize = parseInt(config.AUDIT_BATCH_SIZE || '100', 10);
  }

  static resetInstance(): void {
    AuditLogService.instance = null;
  }

  static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService();
    }
    return AuditLogService.instance;
  }

  getRetentionDays(): number {
    return this.retentionDays;
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  async log(
    licenseId: string,
    event: AuditEventType,
    options?: {
      tier?: string;
      ip?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<AuditLog> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const log: AuditLog = {
      id,
      licenseId,
      event,
      tier: options?.tier,
      ip: options?.ip,
      metadata: options?.metadata,
      createdAt: now,
    };

    await logAudit({
      id: log.id,
      timestamp: log.createdAt,
      actor: licenseId,
      action: log.event,
      resource: `License:${licenseId}`,
      result: 'success',
      metadata: { ...(log.metadata ?? {}), ...(log.tier ? { tier: log.tier } : {}) },
      ipHash: hashIpAddress(log.ip),
      tenantId: licenseId,
    });

    return log;
  }

  private mapRowToAuditLog(entry: IAuditEntry): AuditLog {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
    return {
      id: entry.id,
      licenseId: entry.tenantId ?? entry.actor,
      event: entry.action as AuditEventType,
      createdAt: entry.timestamp,
      metadata,
      tier: metadata.tier as string | undefined,
    };
  }

  async getLogsByLicense(licenseId: string, filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    const limit = filters.limit ?? this.batchSize;
    const { rows } = await query(SELECT_BY_LICENSE_SQL, [licenseId, limit]);
    return AuditLogValidators.filterLogs(rows.map((r) => this.mapRowToAuditLog(r as unknown as IAuditEntry)), { ...filters, licenseId });
  }

  async getAllLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
    const limit = filters.limit ?? this.batchSize;
    const { rows } = await query(SELECT_ALL_SQL, [limit]);
    return AuditLogValidators.filterLogs(rows.map((r) => this.mapRowToAuditLog(r as unknown as IAuditEntry)), filters);
  }

  async getRecentActivity(limit = 10): Promise<AuditLog[]> {
    const { rows } = await query(SELECT_ALL_SQL, [limit]);
    return AuditLogValidators.getRecentActivity(rows.map((r) => this.mapRowToAuditLog(r as unknown as IAuditEntry)), limit);
  }

  async logApiCall(
    licenseId: string,
    endpoint: string,
    options?: { ip?: string; tier?: string },
  ): Promise<AuditLog> {
    return this.log(licenseId, 'api_call', {
      tier: options?.tier,
      ip: options?.ip,
      metadata: { endpoint },
    });
  }

  async logMlFeature(
    licenseId: string,
    feature: string,
    options?: { ip?: string; tier?: string },
  ): Promise<AuditLog> {
    return this.log(licenseId, 'ml_feature', {
      tier: options?.tier,
      ip: options?.ip,
      metadata: { feature },
    });
  }

  async logRateLimit(
    licenseId: string,
    limit: number,
    current: number,
    options?: { ip?: string; tier?: string },
  ): Promise<AuditLog> {
    return this.log(licenseId, 'rate_limit', {
      tier: options?.tier,
      ip: options?.ip,
      metadata: { limit, current },
    });
  }

  // Batch write audit logs
  async batchWrite(entries: BatchWriteEntry[]): Promise<BatchWriteResult> {
    return AuditLogBatchWriter.write(entries, this.batchSize, async (entry) => {
      await this.log(entry.licenseId, entry.event, {
        tier: entry.tier,
        ip: entry.ip,
        metadata: entry.metadata,
      });
    });
  }

  async getExpiredLogIds(): Promise<string[]> {
    return executeGetExpiredLogIds(this.retentionDays);
  }

  async cleanupExpiredLogs(): Promise<{ removed: number; cutoffDate: string }> {
    return executeCleanupExpiredLogs(this.retentionDays);
  }

  exportToCsv(logs: AuditLog[]): string {
    return AuditLogExporter.toCsv(logs);
  }

  exportToJson(logs: AuditLog[]): string {
    return AuditLogExporter.toJson(logs);
  }
}
