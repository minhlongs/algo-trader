/**
 * DLP Outbound Recorder
 * Persists hash-chained audit rows to D1.
 * Batches writes: flush every 100 rows or every 1 s (whichever comes first).
 */

import { buildChainRow, sha256, CHAIN_GENESIS, type ChainRow } from './dlp-hash-chain';
import type { DlpAction } from '../../desk/ironclaw/dlp-pattern-registry';

const BATCH_SIZE = 100;
const FLUSH_INTERVAL_MS = 1_000;

export interface AuditEntry {
  id: string;
  subscriberId: string;
  url: string;
  method: string;
  action: DlpAction;
  patternId: string | null;
  body: string;
  ts: string;
}

/** Minimal D1-like interface — injectable for tests. */
export interface AuditStore {
  run(sql: string, ...params: unknown[]): Promise<{ meta?: { last_row_id?: number } }>;
  query(sql: string, ...params: unknown[]): Promise<{ results: Array<{ row_hash: string }> }>;
}

export class DlpOutboundRecorder {
  private queue: Array<Omit<ChainRow, 'rowHash' | 'prevHash'> & { body: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private prevHash = CHAIN_GENESIS;

  constructor(private readonly store: AuditStore) {}

  /**
   * Enqueue one audit entry. Flushes automatically when batch is full.
   */
  async record(entry: AuditEntry): Promise<void> {
    const payloadHash = sha256(entry.body);
    this.queue.push({
      id: entry.id,
      subscriberId: entry.subscriberId,
      url: entry.url,
      method: entry.method,
      action: entry.action,
      patternId: entry.patternId,
      payloadHash,
      ts: entry.ts,
      body: entry.body,
    });

    if (this.queue.length >= BATCH_SIZE) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  /**
   * Force-flush pending queue (call on Worker shutdown / end of request).
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    const rows: ChainRow[] = [];

    for (const item of batch) {
      const partial = {
        id: item.id,
        subscriberId: item.subscriberId,
        url: item.url,
        method: item.method,
        action: item.action,
        patternId: item.patternId,
        payloadHash: item.payloadHash,
        ts: item.ts,
      };
      const row = buildChainRow(partial, this.prevHash);
      rows.push(row);
      this.prevHash = row.rowHash;
    }

    await this.writeBatch(rows);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => { /* swallow — best-effort */ });
    }, FLUSH_INTERVAL_MS);
  }

  private async writeBatch(rows: ChainRow[]): Promise<void> {
    for (const row of rows) {
      await this.store.run(
        `INSERT INTO dlp_audit_log
           (id, subscriber_id, url, method, action, pattern_id, payload_hash, prev_hash, row_hash, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.subscriberId,
        row.url,
        row.method,
        row.action,
        row.patternId,
        row.payloadHash,
        row.prevHash,
        row.rowHash,
        row.ts,
      );
    }
  }

  /** Retrieve the last known row hash from D1 (used for chain continuity across restarts). */
  async loadPrevHash(): Promise<string> {
    const { results } = await this.store.query(
      `SELECT row_hash FROM dlp_audit_log ORDER BY ts DESC LIMIT 1`
    );
    this.prevHash = results[0]?.row_hash ?? CHAIN_GENESIS;
    return this.prevHash;
  }
}
