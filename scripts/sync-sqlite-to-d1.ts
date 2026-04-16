#!/usr/bin/env -S npx tsx
/**
 * Incremental sync: M1 Max SQLite paper_trades_v3 -> D1 algo-trader-prod.paper_trades
 *
 * Strategy:
 *  1) Read last_synced_id from D1 sync_state (KISS — no KV, D1 is source of state)
 *  2) SELECT rows WHERE id > last_synced_id from local SQLite
 *  3) Emit batch SQL file with INSERT OR REPLACE rows + UPDATE sync_state
 *  4) Apply via `wrangler d1 execute --remote --file`
 *
 * Idempotent (INSERT OR REPLACE) and safe to re-run.
 * Logs to ~/Library/Logs/algo-trader-sync-d1.log when called from launchd.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB_NAME = 'algo-trader-prod';
const SOURCE_DB = process.env.ALGO_SQLITE || 'data/algo-trade.db';
const SOURCE_TABLE = 'paper_trades_v3';
const TARGET_TABLE = 'paper_trades';
const BATCH_LIMIT = 500;

interface SourceRow {
  id: number;
  timestamp: string;
  condition_id: string | null;
  slug: string | null;
  category: string | null;
  market_question: string;
  market_prob: number;
  our_prob: number;
  edge: number;
  direction: string;
  confidence: number | null;
  reasoning: string | null;
  strategy: string | null;
  resolved: number;
  outcome: string | null;
  correct: number | null;
}

function sqliteJson<T = unknown>(query: string): T[] {
  const out = execSync(`sqlite3 -json "${SOURCE_DB}" "${query.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  }).trim();
  if (!out) return [];
  return JSON.parse(out) as T[];
}

function wrangler(args: string[]): string {
  const cmd = `npx wrangler ${args.join(' ')}`;
  return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function getLastSyncedId(): number {
  const out = wrangler([
    'd1', 'execute', DB_NAME, '--remote', '--json',
    `--command="SELECT last_synced_id FROM sync_state WHERE source_table='${SOURCE_TABLE}'"`,
  ]);
  try {
    const parsed = JSON.parse(out);
    const rows = parsed[0]?.results ?? [];
    return rows[0]?.last_synced_id ?? 0;
  } catch {
    return 0;
  }
}

function esc(v: string | null | number | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildInsertSql(rows: SourceRow[]): string {
  const syncedAt = Math.floor(Date.now() / 1000);
  const values = rows.map((r) => (
    `(${esc(r.id)},${esc(r.timestamp)},${esc(r.condition_id)},`
    + `${esc(r.slug)},${esc(r.category)},${esc(r.market_question)},`
    + `${esc(r.market_prob)},${esc(r.our_prob)},${esc(r.edge)},`
    + `${esc(r.direction)},${esc(r.confidence)},${esc(r.reasoning)},`
    + `${esc(r.strategy ?? 'blind_event_only')},${esc(r.resolved ?? 0)},`
    + `${esc(r.outcome)},${esc(r.correct)},${syncedAt})`
  )).join(',\n');
  return `INSERT OR REPLACE INTO ${TARGET_TABLE} (
    id,timestamp,condition_id,slug,category,market_question,
    market_prob,our_prob,edge,direction,confidence,reasoning,
    strategy,resolved,outcome,correct,synced_at
  ) VALUES\n${values};`;
}

function main() {
  const lastId = getLastSyncedId();
  console.log(`[sync] Last synced id: ${lastId}`);

  const cols = 'id,timestamp,condition_id,slug,category,market_question,'
    + 'market_prob,our_prob,edge,direction,confidence,reasoning,strategy,'
    + 'resolved,outcome,correct';
  const rows = sqliteJson<SourceRow>(
    `SELECT ${cols} FROM ${SOURCE_TABLE} WHERE id > ${lastId} `
    + `ORDER BY id ASC LIMIT ${BATCH_LIMIT};`,
  );

  if (rows.length === 0) {
    console.log('[sync] No new rows. Exiting.');
    return;
  }

  const maxId = Math.max(...rows.map((r) => r.id));
  console.log(`[sync] Pushing ${rows.length} rows (id ${lastId + 1}..${maxId})`);

  const dir = mkdtempSync(join(tmpdir(), 'd1-sync-'));
  const sqlFile = join(dir, 'batch.sql');
  const insertSql = buildInsertSql(rows);
  const stateSql = `INSERT INTO sync_state (source_table,last_synced_id,last_synced_at) `
    + `VALUES ('${SOURCE_TABLE}',${maxId},${Math.floor(Date.now() / 1000)}) `
    + `ON CONFLICT(source_table) DO UPDATE SET `
    + `last_synced_id=excluded.last_synced_id,last_synced_at=excluded.last_synced_at;`;
  writeFileSync(sqlFile, `BEGIN;\n${insertSql}\n${stateSql}\nCOMMIT;\n`);

  wrangler(['d1', 'execute', DB_NAME, '--remote', `--file="${sqlFile}"`]);
  console.log(`[sync] Pushed. New last_synced_id=${maxId}`);
}

main();
