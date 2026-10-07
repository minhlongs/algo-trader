/**
 * Metering Synchronization Types
 * Batch reconciliation records and synchronization status shapes for D1 to Postgres.
 */

export type SyncStatus = 'IDLE' | 'SYNCING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface D1MetricRecord {
  id: number;
  tenant_id: string;
  metric_name: string;
  metric_value: number;
  period_start: string;
  period_end: string;
  recorded_at: string;
}

export interface PostgresMetricRecord {
  tenantId: string;
  metricName: string;
  aggregatedValue: number;
  periodStart: string;
  periodEnd: string;
  checkpointId: number;
  syncedAt: string;
}

export interface SyncCheckpoint {
  pipelineName: string;
  lastD1Id: number;
  lastSyncedAt: string;
  status: SyncStatus;
}

export interface ReconciliationBatch {
  batchId: string;
  fromCheckpoint: number;
  toCheckpoint: number;
  records: D1MetricRecord[];
  status: SyncStatus;
}

export interface SyncResult {
  success: boolean;
  status: SyncStatus;
  batchId: string;
  processedCount: number;
  syncedCount: number;
  failedCount: number;
  checkpoint: number;
  durationMs: number;
  errors: string[];
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface PostgresQueryResult<T = unknown> {
  rows: T[];
  rowCount?: number;
}

export interface PostgresClientLike {
  query<T = unknown>(text: string, params?: unknown[]): Promise<PostgresQueryResult<T>>;
}

export interface MeteringSyncOptions {
  batchSize?: number;
  pipelineName?: string;
  maxRetries?: number;
}
