/**
 * D1 & Postgres Metering Synchronization Pipeline
 * Reconciles edge usage metrics between Cloudflare D1 and PostgreSQL with checkpoint tracking.
 *
 * Split: SQL catalogue and row/result mapping live in metering-sync-queries.ts;
 * this module owns the fetch → upsert → checkpoint control flow.
 */

import crypto from 'node:crypto';
import { logger } from '../shared/utils/logger';
import type {
  D1DatabaseLike,
  D1MetricRecord,
  MeteringSyncOptions,
  PostgresClientLike,
  SyncResult,
  SyncStatus,
} from './metering-sync-types';
import {
  METERING_SYNC_SQL,
  buildSyncResult,
  initialCheckpoint,
  ledgerUpsertParams,
  nextCheckpointId,
  toCheckpoint,
  type CheckpointRow,
} from './metering-sync-queries';

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

  async getCheckpoint() {
    try {
      const res = await this.pg.query<CheckpointRow>(METERING_SYNC_SQL.getCheckpoint, [
        this.pipelineName,
        1,
      ]);
      const checkpoint = toCheckpoint(res.rows[0]);
      if (checkpoint) return checkpoint;
    } catch (err) {
      logger.error('[MeteringSync] Failed to fetch checkpoint:', { err });
    }
    return initialCheckpoint(this.pipelineName);
  }

  async saveCheckpoint(lastD1Id: number, status: SyncStatus): Promise<void> {
    await this.pg.query(METERING_SYNC_SQL.saveCheckpoint, [
      this.pipelineName, lastD1Id, new Date().toISOString(), status,
    ]);
  }

  async fetchEdgeRecords(fromId: number, limit: number): Promise<D1MetricRecord[]> {
    const stmt = this.d1.prepare(METERING_SYNC_SQL.fetchEdgeRecords).bind(fromId, limit);
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
      return buildSyncResult(false, 'FAILED', batchId, 0, 0, 0, checkpoint.lastD1Id, start, [msg]);
    }

    if (records.length === 0) {
      return buildSyncResult(true, 'IDLE', batchId, 0, 0, 0, checkpoint.lastD1Id, start, []);
    }

    try {
      await this.saveCheckpoint(checkpoint.lastD1Id, 'SYNCING');
      const syncedAt = new Date().toISOString();

      for (const rec of records) {
        await this.pg.query(METERING_SYNC_SQL.upsertLedger, ledgerUpsertParams(rec, syncedAt));
      }

      const nextId = nextCheckpointId(records);
      await this.saveCheckpoint(nextId, 'SUCCESS');
      logger.info(`[MeteringSync] Synced batch ${batchId} (${records.length} records, checkpoint=${nextId})`);

      return buildSyncResult(true, 'SUCCESS', batchId, records.length, records.length, 0, nextId, start, []);
    } catch (err) {
      const msg = `Postgres persistence failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('[MeteringSync]', { error: msg });
      try {
        await this.saveCheckpoint(checkpoint.lastD1Id, 'FAILED');
      } catch (checkpointErr) {
        logger.error('[MeteringSync] Failed to mark checkpoint failure:', { checkpointErr });
      }
      return buildSyncResult(false, 'FAILED', batchId, records.length, 0, records.length, checkpoint.lastD1Id, start, [msg]);
    }
  }
}
