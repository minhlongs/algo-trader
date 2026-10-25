/**
 * Metering Sync Queries
 *
 * SQL catalogue and row/result mapping for the D1 ↔ Postgres metering
 * reconciliation. Extracted so the sync pipeline stays a control flow and the
 * durable write shapes (checkpoint upsert, ledger upsert) live in one place.
 */

import type {
  D1MetricRecord,
  SyncCheckpoint,
  SyncResult,
  SyncStatus,
} from './metering-sync-types';

/** Checkpoint row as returned by the SELECT (numeric columns arrive as strings). */
export interface CheckpointRow {
  pipeline_name: string;
  last_d1_id: number;
  last_synced_at: string;
  status: SyncStatus;
}

/** Column list selected from the checkpoint table. */
const CHECKPOINT_COLUMNS = 'pipeline_name, last_d1_id, last_synced_at, status';

/** Column list selected from the edge metering table. */
const EDGE_RECORD_COLUMNS =
  'id, tenant_id, metric_name, metric_value, period_start, period_end, recorded_at';

export const METERING_SYNC_SQL = {
  /** Latest checkpoint for a pipeline, used to resume after the last synced id. */
  getCheckpoint: `SELECT ${CHECKPOINT_COLUMNS} FROM metering_sync_checkpoints WHERE pipeline_name = $1 LIMIT $2`,
  /** Checkpoint upsert keyed on pipeline name. */
  saveCheckpoint:
    'INSERT INTO metering_sync_checkpoints (pipeline_name, last_d1_id, last_synced_at, status) ' +
    'VALUES ($1, $2, $3, $4) ' +
    'ON CONFLICT (pipeline_name) DO UPDATE SET last_d1_id = EXCLUDED.last_d1_id, last_synced_at = EXCLUDED.last_synced_at, status = EXCLUDED.status',
  /** Edge records past the checkpoint, oldest first. */
  fetchEdgeRecords:
    `SELECT ${EDGE_RECORD_COLUMNS} FROM edge_metering_events WHERE id > ? ORDER BY id ASC LIMIT ?`,
  /**
   * Central ledger upsert. Values accumulate on conflict so a re-delivered
   * edge record adds to the running total rather than overwriting it.
   */
  upsertLedger:
    'INSERT INTO central_metering_ledger (tenant_id, metric_name, aggregated_value, period_start, period_end, checkpoint_id, synced_at) ' +
    'VALUES ($1, $2, $3, $4, $5, $6, $7) ' +
    'ON CONFLICT (tenant_id, metric_name, period_start, period_end) DO UPDATE SET ' +
    'aggregated_value = central_metering_ledger.aggregated_value + EXCLUDED.aggregated_value, ' +
    'synced_at = EXCLUDED.synced_at',
} as const;

/** Map a checkpoint row to the checkpoint shape, or null when absent. */
export function toCheckpoint(row: CheckpointRow | undefined): SyncCheckpoint | null {
  if (!row) return null;
  return {
    pipelineName: row.pipeline_name,
    lastD1Id: Number(row.last_d1_id),
    lastSyncedAt: row.last_synced_at,
    status: row.status,
  };
}

/** Fresh checkpoint used before a pipeline has ever synced. */
export function initialCheckpoint(pipelineName: string): SyncCheckpoint {
  return {
    pipelineName,
    lastD1Id: 0,
    lastSyncedAt: new Date(0).toISOString(),
    status: 'IDLE',
  };
}

/** Parameters bound to METERING_SYNC_SQL.upsertLedger for one edge record. */
export function ledgerUpsertParams(
  record: D1MetricRecord,
  syncedAt: string,
): unknown[] {
  return [
    record.tenant_id,
    record.metric_name,
    record.metric_value,
    record.period_start,
    record.period_end,
    record.id,
    syncedAt,
  ];
}

/** Highest edge-record id in a batch, i.e. the next checkpoint. */
export function nextCheckpointId(records: D1MetricRecord[]): number {
  return Math.max(...records.map((r) => r.id));
}

/** Build the per-batch sync outcome. */
export function buildSyncResult(
  success: boolean,
  status: SyncStatus,
  batchId: string,
  processed: number,
  synced: number,
  failed: number,
  checkpoint: number,
  startTime: number,
  errors: string[],
): SyncResult {
  return {
    success,
    status,
    batchId,
    processedCount: processed,
    syncedCount: synced,
    failedCount: failed,
    checkpoint,
    durationMs: Date.now() - startTime,
    errors,
  };
}
