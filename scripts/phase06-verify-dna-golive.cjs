#!/usr/bin/env node
/**
 * Phase 06 Live Verification: DNA Go-Live Upgrade (CommonJS, dist)
 *
 * Strategy
 * 1. Set DB_* env BEFORE requiring postgres-client so the module-level
 *    singleton Pool connects to the staging DB (ndx_postgres).
 * 2. Run migrations 022 (dna_journal) + 023 (dna_engine_state).
 * 3. Insert a synthetic journal row using the MIGRATION 022 column names
 *    (the DB-authoritative schema) and read it back.
 * 4. Verify dna_engine_state singleton seeded.
 * 5. Exit 0 only if everything passes.
 */
process.env.DB_HOST      = '127.0.0.1';
process.env.DB_PORT      = '5432';
process.env.DB_USER      = 'postgres';
process.env.DB_PASSWORD  = 'postgres';
process.env.DB_NAME      = 'nhipdieuxanh_db';

const { runMigrations }       = require('../dist/db/migration-runner.js');
const { getDbClient, closeDbConnection } = require('../dist/db/postgres-client.js');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

let failCount = 0;

function ok(msg)  { console.log(`${GREEN}✅ PASS${RESET}: ${msg}`); }
function bad(msg) { failCount++; console.log(`${RED}❌ FAIL${RESET}: ${msg}`); }
function step(lbl){ console.log(`${BOLD}${YELLOW}→ ${lbl}${RESET}`); }

async function waitForDb() {
  step('Connecting to staging DB (ndx_postgres 127.0.0.1:5432 / nhipdieuxanh_db)');
  for (let i = 0; i < 30; i++) {
    try {
      const c = getDbClient();
      await c.query('SELECT 1');
      ok('DB connection OK');
      return;
    } catch (_) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  bad('Could not connect to staging DB within 30s');
  process.exit(1);
}

async function gateMigrations() {
  step('Running migrations (022 dna_journal, 023 dna_engine_state)');
  try {
    await runMigrations();
    ok('Migrations applied (022 + 023)');
  } catch (e) {
    bad(`Migration runner error: ${e.message}`);
  }
}

async function gateTables() {
  step('Verifying dna_journal and dna_engine_state tables exist');
  const c = getDbClient();
  try {
    const r = await c.query(
      `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN ('dna_journal','dna_engine_state')`
    );
    const found = new Set(r.rows.map(x => x.tablename));
    if (found.has('dna_journal') && found.has('dna_engine_state')) {
      ok('Both tables present');
    } else {
      bad(`Tables missing. Found: ${[...found].join(',') || 'none'}`);
    }
  } catch (e) {
    bad(`Table check error: ${e.message}`);
  }
}

/**
 * Insert a synthetic journal row using the MIGRATION 022 column names
 * (canonical DB schema):
 *   trace_id, created_at, action, decision, confidence,
 *   weighted_bull, weighted_bear, reason, regime, tf_signals,
 *   executed_by, paper_mode, candle_tfs, candle_from_ms, candle_to_ms,
 *   error_message
 */
async function gateJournalWrite() {
  step('End-to-end: insert + read a synthetic DNA journal row');
  const c = getDbClient();
  const traceId = `phase06-verify-${Date.now()}`;
  try {
    const nowIso = new Date().toISOString();
    const { rows } = await c.query(
      `INSERT INTO dna_journal
         (trace_id, created_at, action, decision, confidence,
          weighted_bull, weighted_bear, reason, regime, tf_signals,
          executed_by, paper_mode, candle_tfs, candle_from_ms, candle_to_ms,
          error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        traceId, nowIso,
        'evaluate', 'HOLD', 0.4, 0.35, 0.30,
        'phase06-live-verification',
        'neutral',
        '{}',
        'phase06-verify',
        true,
        '{}',
        null, null, null
      ]
    );
    const rowId = rows[0].id;
    ok(`Inserted journal row id=${rowId} traceId=${traceId}`);

    const back = await c.query(
      'SELECT id, trace_id, action, decision, regime, paper_mode FROM dna_journal WHERE trace_id = $1',
      [traceId]
    );
    if (back.rows.length === 1) {
      const r = back.rows[0];
      ok(`Read back 1 row — id=${r.id} decision=${r.decision} regime=${r.regime} paper=${r.paper_mode}`);
    } else {
      bad(`Read back ${back.rows.length} rows (expected 1)`);
    }

    await c.query('DELETE FROM dna_journal WHERE trace_id = $1', [traceId]);
    ok('Cleanup completed');
  } catch (e) {
    bad(`Journal write/read error: ${e.message}`);
  }
}

async function gateEngineState() {
  step('Verifying dna_engine_state singleton row seeded');
  const c = getDbClient();
  try {
    const r = await c.query(
      "SELECT id, state FROM dna_engine_state WHERE id = 'singleton'"
    );
    if (r.rows.length === 1) {
      ok(`dna_engine_state singleton present: id=${r.rows[0].id}`);
    } else if (r.rows.length === 0) {
      bad('dna_engine_state singleton missing (migration did not seed it)');
    } else {
      bad(`Unexpected rows in dna_engine_state: ${r.rows.length}`);
    }
  } catch (e) {
    bad(`State store check error: ${e.message}`);
  }
}

async function main() {
  console.log(`${BOLD}${YELLOW}=== Phase 06: DNA Go-Live Live Verification (staging DB) ===${RESET}\n`);
  await waitForDb();
  await gateMigrations();
  await gateTables();
  await gateJournalWrite();
  await gateEngineState();

  await closeDbConnection();

  console.log('\n' + '='.repeat(60));
  if (failCount === 0) {
    console.log(`${GREEN}${BOLD}✅ ALL CHECKS PASSED — Phase 06 verified against staging DB${RESET}`);
    process.exit(0);
  } else {
    console.log(`${RED}${BOLD}❌ ${failCount} check(s) FAILED — Phase 06 NOT verified${RESET}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error(`${RED}Unhandled error:${RESET}`, e);
  process.exit(2);
});
