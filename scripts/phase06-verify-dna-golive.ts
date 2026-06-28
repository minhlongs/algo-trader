#!/usr/bin/env tsx
/**
 * Phase 06 Live Verification: DNA Go-Live Upgrade
 *
 * Strategy
 * 1. Set DB_* env vars BEFORE `getDbClient()` is called so the singleton
 *    Pool connects to the correct staging database (ndx_postgres).
 * 2. Run migrations 022 (dna_journal) and 023 (dna_engine_state).
 * 3. Insert a synthetic DNA journal row and read it back.
 * 4. Verify dna_engine_state singleton seeded correctly.
 * 5. Exit non-zero if any step fails.
 */
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_NAME = 'nhipdieuxanh_db';

import { runMigrations } from '../src/db/migration-runner.js';
import { getDbClient, closeDbConnection } from '../src/db/postgres-client.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let failCount = 0;

function pass(msg: string) {
  console.log(`${GREEN}✅ PASS${RESET}: ${msg}`);
}
function fail(msg: string) {
  failCount++;
  console.log(`${RED}❌ FAIL${RESET}: ${msg}`);
}
function step(label: string) {
  console.log(`${BOLD}${YELLOW}→ ${label}${RESET}`);
}

async function waitForDb(): Promise<void> {
  step('Connecting to staging DB (ndx_postgres: 127.0.0.1:5432 / nhipdieuxanh_db)');
  for (let i = 0; i < 30; i++) {
    try {
      const c = getDbClient();
      await c.query('SELECT 1');
      pass('DB connection OK');
      return;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  fail('Could not connect to staging DB within 30s');
}

async function runMigrationGate(): Promise<void> {
  step('Running migrations (022 dna_journal, 023 dna_engine_state)');
  try {
    await runMigrations();
    pass('Migrations applied (022 + 023)');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`Migration runner error: ${msg}`);
  }
}

async function verifyTablesExist(): Promise<void> {
  step('Verifying dna_journal and dna_engine_state tables');
  const c = getDbClient();
  try {
    const r = await c.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('dna_journal','dna_engine_state')`
    );
    const found = new Set(r.rows.map((row: { tablename: string }) => row.tablename));
    if (found.has('dna_journal') && found.has('dna_engine_state')) {
      pass('Both dna_journal and dna_engine_state tables present');
    } else {
      fail(`Tables missing. Found: ${[...found].join(', ') || 'none'}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`Table check error: ${msg}`);
  }
}

async function insertAndReadJournal(): Promise<void> {
  step('Inserting + reading a synthetic DNA journal row (end-to-end)');
  const c = getDbClient();
  const traceId = `phase06-verify-${Date.now()}`;
  try {
 const sql = `
 INSERT INTO dna_journal
 (trace_id, created_at, action, decision, confidence,
  weighted_bull, weighted_bear, reason, regime,
  tf_signals, executed_by, paper_mode)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
 RETURNING id
 `;
 const params = [
 traceId,
 new Date().toISOString(),
 'evaluate',
 'HOLD',
 0.4,
 0.35,
 0.30,
 'phase06-verification',
 'neutral',
 '{}',
 'phase06-verify.ts',
 true,
 ];
    const { rows } = await c.query(sql, params);
    const insertedId = rows[0].id;
    pass(`Inserted journal row id=${insertedId} traceId=${traceId}`);

    const back = await c.query('SELECT * FROM dna_journal WHERE trace_id = $1', [traceId]);
    if (back.rows.length === 1) {
      pass(`Read back 1 row — decision=${back.rows[0].decision} regime=${back.rows[0].regime}`);
    } else {
      fail(`Read back ${back.rows.length} rows (expected 1)`);
    }

    await c.query('DELETE FROM dna_journal WHERE trace_id = $1', [traceId]);
    pass('Cleanup completed');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`Journal write/read error: ${msg}`);
  }
}

async function verifyStateStoreInitialized(): Promise<void> {
  step('Verifying dna_engine_state singleton row');
  try {
    const c = getDbClient();
    const r = await c.query("SELECT id, state FROM dna_engine_state WHERE id = 'singleton'");
    if (r.rows.length === 1) {
      pass(`dna_engine_state singleton present: id=${r.rows[0].id}`);
    } else if (r.rows.length === 0) {
      fail('dna_engine_state singleton row missing (migration did not seed it)');
    } else {
      fail(`Unexpected rows in dna_engine_state: ${r.rows.length}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(`State store check error: ${msg}`);
  }
}

async function main(): Promise<void> {
  await waitForDb();
  await runMigrationGate();
  await verifyTablesExist();
  await insertAndReadJournal();
  await verifyStateStoreInitialized();

  await closeDbConnection();

  console.log('\n' + '='.repeat(60));
  if (failCount === 0) {
    console.log(`${GREEN}${BOLD}✅ Phase 06 live verification: ALL CHECKS PASSED${RESET}`);
    process.exit(0);
  } else {
    console.log(`${RED}${BOLD}❌ Phase 06 live verification: ${failCount} check(s) FAILED${RESET}`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`${RED}Unhandled error:${RESET}`, e);
  process.exit(2);
});
