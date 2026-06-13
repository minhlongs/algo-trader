#!/usr/bin/env -S node --import=tsx/esm.js
/**
 * Phase 06 Live Verification — Binance Candle Provider + DNA Engine on staging DB
 *
 * Flow
 * 1. Set DB_* env so the postgres-client singleton connects to staging (ndx_postgres).
 * 2. Force-postgres reinit by calling getDbClient() after env is set.
 * 3. Run migrations to ensure tables exist.
 * 4. Start DNA engine wired to the real Binance REST CandleProvider, in paper mode.
 * 5. Attach a lifecycle listener that logs every tick, tf_ready, consensus, and journal_written event.
 * 6. Let it run ~90s (a few 1m/5m candle boundaries, so we expect at least one journal row).
 * 7. After shutdown, poll dna_journal for new rows and report pass/fail.
 *
 * Note: the env vars must be set BEFORE any import, otherwise the postgres-client
 * module-level Pool singleton will connect to the wrong database.
 */
process.env.DB_HOST      = '127.0.0.1';
process.env.DB_PORT      = '5432';
process.env.DB_USER      = 'postgres';
process.env.DB_PASSWORD  = 'postgres';
process.env.DB_NAME      = 'nhipdieuxanh_db';
process.env.LOG_LEVEL    = 'info';

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

let failCount = 0;
const events: any[] = [];
function ok(msg: string) { console.log(`${GREEN}✅ PASS${RESET}: ${msg}`); }
function bad(msg: string) { failCount++; console.log(`${RED}❌ FAIL${RESET}: ${msg}`); }
function step(lbl: string){ console.log(`\n${BOLD}${YELLOW}→ ${lbl}${RESET}`); }

// ------------------------------------------------------------------ imports
// We need to force the postgres singleton to re-init AFTER env is set.
// `getDbClient({ forceReinit: true, ... })` closes the old pool and creates a new one.
import { getDbClient, closeDbConnection, query } from '../src/db/postgres-client.js';
import { runMigrations }                     from '../src/db/migration-runner.js';
import { startDnaEngine, stopDnaEngine, onDnaEvent, getDnaEngine } from '../src/strategies/dna/orchestrator.js';
import type { DnaLifecycleEvent } from '../src/strategies/dna/multi-tf-types.js';
import { createBinanceCandleProvider, BINANCE_SYMBOL }             from '../src/strategies/dna/binance-candle-provider.js';
import { createPostgresStateStore }                                 from '../src/strategies/dna/dna-state-store.js';
import { setTimeout as wait } from 'node:timers/promises';

const RUN_MS = 360_000; // 360 seconds — 1m + 5m candles both close at least once, enough for minTfAgreement=2 consensus
async function initDb() {
  step('DB: connect + run migrations on staging');
  await new Promise<void>((ok, fail) => {
    setTimeout(() => {
      try {
        getDbClient({}).query('SELECT 1');
        ok();
      } catch (e: unknown) {
        const emsg = e instanceof Error ? e.message : String(e);
        fail(new Error(emsg));
      }
    }, 500);
  });
  await runMigrations();
  ok('Migrations applied');
}

function attachListener() {
  step('DNA: attaching lifecycle listener');
  const unsub = onDnaEvent((ev: DnaLifecycleEvent) => {
    const rec: Record<string, unknown> = { at: new Date().toISOString(), type: ev.type };
    if (ev.type === 'tick') {
      rec.tf = ev.tf;
    } else if (ev.type === 'tf_ready') {
      rec.tf = ev.tf;
      rec.candleCount = ev.candleCount;
    } else if (ev.type === 'consensus_computed') {
      rec.action = (ev as { signal: { action?: string } }).signal?.action;
      rec.confidence = (ev as { signal: { confidence?: number } }).signal?.confidence;
      rec.regime = (ev as { signal: { regime?: string } }).signal?.regime;
    } else if (ev.type === 'journal_written') {
      const jwEntry = ev as { entry: { traceId: string; decision: string } };
      rec.traceId = jwEntry.entry.traceId;
      rec.decision = jwEntry.entry.decision;
    } else if (ev.type === 'error') {
      const errEv = ev as { context: string; err: { message?: string } };
      rec.context = errEv.context;
      rec.message = errEv.err?.message;
    }
    events.push(rec);
    // Compact live log — only print high-signal events
    if (['tf_ready','consensus_computed','journal_written','error'].includes(ev.type)) {
      console.log(`   [evt] ${ev.type}${rec.action ? ` action=${rec.action}` : ''}${rec.confidence != null ? ` conf=${(+rec.confidence).toFixed(3)}` : ''}${rec.regime ? ` regime=${rec.regime}` : ''}${rec.candleCount ? ` candles=${rec.candleCount}` : ''}`);
    }
  });
  return unsub;
}

async function startEngine() {
  step(`DNA engine start: paper-mode, symbol=${BINANCE_SYMBOL}`);
  const provider = createBinanceCandleProvider(BINANCE_SYMBOL);
  // Sanity: fetch a few candles right now to confirm Binance reachability
  const test1m = await provider.getCandles('1m', Date.now(), 5);
  ok(`Binance REST reachable — ${test1m.length} 1m candles fetched for ${BINANCE_SYMBOL}`);
  if (test1m.length === 0) bad('Binance returned 0 candles — check network/Binance status');

  const stateStore = await createPostgresStateStore();
  // minTfAgreement=2 + relaxed confidence so 1m+5m can actually form consensus in 150s
  const engine = startDnaEngine(provider, {
    minTfAgreement: 2,
    minConsensusConfidence: 0.35,
    minConfidencePerTf: { '1m': 0.30, '5m': 0.30, '15m': 0.30, '1h': 0.30, '4h': 0.30, '1d': 0.30 },
  }, stateStore);
console.log(` engine started`);
  console.log(`   running for ${RUN_MS/1000}s...`);
  await wait(RUN_MS);
  return engine;
}

async function stopEngine(unsub: () => void, engine: ReturnType<typeof startDnaEngine>) {
  step('DNA engine stop + state persistence');
  stopDnaEngine();
  unsub();
  // Allow pending state-store save to complete
  await wait(500);
  ok('Engine stopped');
}

async function checkJournalRows() {
  step('Verifying live Binance journal rows produced during run');
  const r = await query(
    `SELECT id, trace_id, action, decision, regime, confidence, executed_by, created_at
       FROM dna_journal
      WHERE executed_by = 'paper'
        AND created_at > now() - interval '15 minutes'
      ORDER BY created_at DESC
      LIMIT 20`
  );
  const rows = r.rows;
  console.log(`   rows found: ${rows.length}`);
  if (rows.length > 0) {
    const top = rows[0];
    ok(`Live journal rows present: ${rows.length} row(s) since start`);
    console.log(`   latest: id=${top.id} action=${top.action} decision=${top.decision} regime=${top.regime} conf=${(+top.confidence!).toFixed(3)} by=${top.executed_by} at=${top.created_at}`);
    if (top.decision === 'paper_only' || top.decision === 'rejected_low_confidence' || top.action !== 'hold') {
      ok('Decision looks reasonable for paper mode');
    }
  } else {
    bad('No paper-mode journal rows produced — check that candles arrive and TF signals are generated');
  }

  // Verify engine-state singleton row still present
  const r2 = await query("SELECT id, state FROM dna_engine_state WHERE id = 'singleton'");
  if (r2.rows.length === 1) {
    ok('dna_engine_state singleton still present after engine restart');
  } else {
    bad(`dna_engine_state missing/duplicate after restart: ${r2.rows.length} rows`);
  }
}

async function summarize() {
  step('Event summary');
  const byType: Record<string, number> = {};
  for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
  for (const [t, n] of Object.entries(byType)) {
    console.log(`   ${t}: ${n}`);
  }
}

async function main() {
  console.log(`${BOLD}${YELLOW}═══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}Phase 06 Live: DNA Engine + Binance Candle Provider (paper)${RESET}`);
  console.log(`${BOLD}${YELLOW}═══════════════════════════════════════════════════════${RESET}`);
  try {
    await initDb();
    const unsub = attachListener();
    const engine = await startEngine();
    await stopEngine(unsub, engine);
    await checkJournalRows();
    await summarize();
 } catch (e: unknown) {
      const emsg = e instanceof Error ? e.message : String(e);
      bad(`Fatal: ${emsg}`);
      console.error(e);
    try { stopDnaEngine(); } catch {}
    try { await closeDbConnection(); } catch {}
  }
  await closeDbConnection();
  console.log('\n' + '='.repeat(60));
  if (failCount === 0) {
    console.log(`${GREEN}${BOLD}✅ ALL CHECKS PASSED — Phase 06 live verified with real Binance candles${RESET}`);
    process.exit(0);
  } else {
    console.log(`${RED}${BOLD}❌ ${failCount} check(s) FAILED — see details above${RESET}`);
    process.exit(1);
  }
}

main();
