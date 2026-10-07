/**
 * D1 & Postgres Metering Synchronization Pipeline
 * Reconciles edge usage metrics between Cloudflare D1 and PostgreSQL with checkpoint tracking.
 */

import crypto from 'node:crypto';
import { logger } from '../shared/utils/logger';
import type {
  D1DatabaseLike,
  D1MetricRecord,
  MeteringSyncOptions,
  PostgresClientLike,
  SyncCheckpoint,
  SyncResult,
  SyncStatus,
} from './metering-sync-types';

export class D1PostgresMeteringSync {
  private d1: D1DatabaseLike;
  private pg: PostgresClientLike;
  private pipelineName: string;
  private batchSize: number;

  constructor(d1: D1DatabaseLike, pg: PostgresClientLike, options?: MeteringSyncOptions) {
    this.d1 = d1;
    this.pg = pg;
    this.pipelineName = options?.pipelineName ?? 'default-metering-sync';
    this.batchSize = options?.batchSize ?? 100;
  }

  async getCheckpoint(): Promise<SyncCheckpoint> {
    try {
      const sql = 'SELECT pipeline_name, last_d1_id, last_synced_at, status FROM metering_sync_checkpoints WHERE pipeline_name = $1 LIMIT $2';
      const res = await this.pg.query<{ pipeline_name: string; last_d1_id: number; last_synced_at: string; status: SyncStatus }>(sql, [
        this.pipelineName,
        1,
      ]);
      const row = res.rows[0];
      if (row) {
        return {
          pipelineName: row.pipeline_name,
          lastD1Id: Number(row.last_d1_id),
          lastSyncedAt: row.last_synced_at,
          status: row.status,
        };
      }
    } catch (err) {
      logger.error('[MeteringSync] Failed to fetch checkpoint:', { err });
    }
    return {
      pipelineName: this.pipelineName,
      lastD1Id: 0,
      lastSyncedAt: new Date(0).toISOString(),
      status: 'IDLE',
    };
  }

  async saveCheckpoint(lastD1Id: number, status: SyncStatus): Promise<void> {
    const sql =
      'INSERT INTO metering_sync_checkpoints (pipeline_name, last_d1_id, last_synced_at, status) ' +
      'VALUES ($1, $2, $3, $4) ' +
      'ON CONFLICT (pipeline_name) DO UPDATE SET last_d1_id = EXCLUDED.last_d1_id, last_synced_at = EXCLUDED.last_synced_at, status = EXCLUDED.status';
    await this.pg.query(sql, [this.pipelineName, lastD1Id, new Date().toISOString(), status]);
  }

  async fetchEdgeRecords(fromId: number, limit: number): Promise<D1MetricRecord[]> {
    const sql =
      'SELECT id, tenant_id, metric_name, metric_value, period_start, period_end, recorded_at ' +
      'FROM edge_metering_events WHERE id > ? ORDER BY id ASC LIMIT ?';
    const stmt = this.d1.prepare(sql).bind(fromId, limit);
    const result = await stmt.all<D1MetricRecord>();
    return result.results ?? [];
  }

  async reconcileBatch(): Promise<SyncResult> {
    const start = Date.now();
    const batchId = crypto.randomUUID();
    const checkpoint = await this.getCheckpoint();

    let records: D1MetricRecord[];
    try {
      records = await this.fetchEdgeRecords(checkpoint.lastD1Id, this.batchSize);
    } catch (err) {
      const msg = `Edge D1 fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[MeteringSync]', { error: msg });
      return this.buildResult(false, 'FAILED', batchId, 0, 0, 0, checkpoint.lastD1Id, start, [msg]);
    }

    if (records.length === 0) {
      return this.buildResult(true, 'IDLE', batchId, 0, 0, 0, checkpoint.lastD1Id, start, []);
    }

    try {
      await this.saveCheckpoint(checkpoint.lastD1Id, 'SYNCING');
      let syncedCount = 0;
      const syncedAt = new Date().toISOString();

      const insertSql =
        'INSERT INTO central_metering_ledger (tenant_id, metric_name, aggregated_value, period_start, period_end, checkpoint_id, synced_at) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $7) ' +
        'ON CONFLICT (tenant_id, metric_name, period_start, period_end) DO UPDATE SET ' +
        'aggregated_value = central_metering_ledger.aggregated_value + EXCLUDED.aggregated_value, ' +
        'synced_at = EXCLUDED.synced_at';

      for (const rec of records) {
        await this.pg.query(insertSql, [
          rec.tenant_id,
          rec.metric_name,
          rec.metric_value,
          rec.period_start,
          rec.period_end,
          rec.id,
          syncedAt,
        ]);
        syncedCount++;
      }

      const nextCheckpointId = Math.max(...records.map((r) => r.id));
      await this.saveCheckpoint(nextCheckpointId, 'SUCCESS');
      logger.info(`[MeteringSync] Synced batch ${batchId} (${syncedCount} records, checkpoint=${nextCheckpointId})`);

      return this.buildResult(true, 'SUCCESS', batchId, records.length, syncedCount, 0, nextCheckpointId, start, []);
    } catch (err) {
      const msg = `Postgres persistence failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[MeteringSync]', { error: msg });
      try {
        await this.saveCheckpoint(checkpoint.lastD1Id, 'FAILED');
      } catch (checkpointErr) {
        logger.error('[MeteringSync] Failed to mark checkpoint failure:', { checkpointErr });
      }
      return this.buildResult(false, 'FAILED', batchId, records.length, 0, records.length, checkpoint.lastD1Id, start, [msg]);
    }
  }

  private buildResult(
    success: boolean,
    status: SyncStatus,
    batchId: string,
    processed: number,
    synced: number,
    failed: number,
    checkpoint: number,
    startTime: number,
    errors: string[]
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
}
