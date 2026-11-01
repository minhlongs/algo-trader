/**
 * Local Staging Drill & Verification Suite
 *
 * Implements Hardening Directives:
 * 1. Fail-closed target matching and verification.
 * 2. Point-in-time backup and restore drill with normalized row-by-row data reconciliation.
 * 3. Candidate migration apply and rollback verification.
 * 4. Paper trading execution path kill switch drill with in-flight task synchronization,
 *    zero unintended mutations, state preservation, and controlled recovery.
 * 5. Monotonic high-resolution timer (process.hrtime.bigint()) for all metric measurements;
 *    zero hardcoded durations.
 *
 * IMPORTANT NOTE:
 * This drill operates strictly as a LOCAL ISOLATED SQLite drill. It does NOT prove
 * remote Cloudflare D1 recovery or production RTO.
 */

import { existsSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { isKillSwitchActive } from '../../src/desk/wiring/qwen-drawdown-monitor';
import {
  processCandidate,
  resetPortfolio,
  getPortfolio,
  setTradesFile,
  setCustomDbPersister,
  resetCapitalReservations,
} from '../../src/desk/wiring/paper-trading-orchestrator';
import type { SignalCandidate } from '../../src/desk/intelligence/signal-validator';

export interface DrillMetric {
  name: string;
  targetMs: number;
  actualMs: number;
  status: 'PASS' | 'FAIL';
  details: string;
}

export interface PaperTradeRecord {
  id: string;
  market_id: string;
  side: string;
  size_usd: number;
  entry_price: number;
  status: string;
  strategy: string;
  pnl: number | null;
  source: string;
  created_at: number;
}

/**
 * Executes a paper trade candidate using the real application pipeline:
 * calls processCandidate(...) from src/desk/wiring/paper-trading-orchestrator.ts.
 * Injects boundary stubs only (isolated file storage + SQLite customDbPersister).
 */
export async function executePaperTradeCandidate(
  dbPath: string,
  candidate: {
    id: string;
    marketId: string;
    side: 'YES' | 'NO';
    sizeUsd: number;
    price: number;
    strategy: string;
    source: string;
    stepSyncBarrier?: () => void;
  },
): Promise<{ executed: boolean; reason?: string }> {
  // 1. Configure boundary persistence to target SQLite dbPath and local temp trades file
  const tmpTrades = resolve(dbPath + '.trades.json');
  setTradesFile(tmpTrades);
  setCustomDbPersister(async (trade) => {
    const insertSql = `
      INSERT INTO paper_trades_v3 (id, market_id, side, size_usd, entry_price, status, strategy, source, created_at)
      VALUES (
        '${trade.id.replace(/'/g, "''")}',
        '${trade.marketId.replace(/'/g, "''")}',
        '${trade.side}',
        ${trade.size},
        ${trade.entryPrice},
        'open',
        '${trade.strategy.replace(/'/g, "''")}',
        '${trade.source.replace(/'/g, "''")}',
        ${trade.timestamp}
      );
    `;
    execSync(`sqlite3 "${dbPath}"`, { input: insertSql, encoding: 'utf8' });
  });

  const countBefore = parseInt(
    execSync(`sqlite3 "${dbPath}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim(),
    10,
  );

  const signalCandidate: SignalCandidate = {
    signalType: candidate.strategy,
    markets: [
      {
        id: candidate.marketId,
        title: `Market ${candidate.marketId}`,
        yesPrice: candidate.price,
        noPrice: parseFloat((1 - candidate.price).toFixed(4)),
      },
    ],
    expectedEdge: 0.05,
    reasoning: 'Endgame near-certain staging drill candidate',
  };

  try {
    await processCandidate(signalCandidate, 10, {
      inFlightBarrier: candidate.stepSyncBarrier,
    });
  } catch (err: unknown) {
    return { executed: false, reason: (err as Error).message };
  }

  const countAfter = parseInt(
    execSync(`sqlite3 "${dbPath}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim(),
    10,
  );

  const executed = countAfter > countBefore;
  return {
    executed,
    reason: executed ? undefined : (isKillSwitchActive() ? 'KILL_SWITCH_ACTIVE' : 'BLOCKED'),
  };
}

/**
 * Reconciles full normalized row data between two SQLite databases for given tables.
 * Returns true only if exact row keys, counts, and contents match.
 * Performs deep symmetric difference across all columns using ATTACH DATABASE in a single pass.
 */
export function reconcileFullDatabaseData(
  primaryDbPath: string,
  restoredDbPath: string,
): { match: boolean; details: string } {
  const sql = `
    ATTACH DATABASE '${restoredDbPath}' AS restored_db;
    SELECT
      (SELECT count(*) FROM (SELECT * FROM subscriptions EXCEPT SELECT * FROM restored_db.subscriptions)) AS sub_diff1,
      (SELECT count(*) FROM (SELECT * FROM restored_db.subscriptions EXCEPT SELECT * FROM subscriptions)) AS sub_diff2,
      (SELECT count(*) FROM (SELECT * FROM paper_trades_v3 EXCEPT SELECT * FROM restored_db.paper_trades_v3)) AS pt_diff1,
      (SELECT count(*) FROM (SELECT * FROM restored_db.paper_trades_v3 EXCEPT SELECT * FROM paper_trades_v3)) AS pt_diff2;
  `;
  const result = execSync(`sqlite3 "${primaryDbPath}" "${sql}"`, { encoding: 'utf8' }).trim();
  const parts = result.split('|').map(s => parseInt(s.trim(), 10));
  const [subDiff1, subDiff2, ptDiff1, ptDiff2] = parts;

  const subsMatch = subDiff1 === 0 && subDiff2 === 0;
  const tradesMatch = ptDiff1 === 0 && ptDiff2 === 0;
  const match = subsMatch && tradesMatch;

  return {
    match,
    details: `Subscriptions symmetric delta: [${subDiff1}, ${subDiff2}], PaperTrades symmetric delta: [${ptDiff1}, ${ptDiff2}]`,
  };
}

export async function runStagingDrill(): Promise<{
  success: boolean;
  metrics: DrillMetric[];
  reconciliation: { match: boolean; details: string };
}> {
  const metrics: DrillMetric[] = [];
  const drillDir = resolve(__dirname, '../../.tmp-staging-drill');
  if (!existsSync(drillDir)) {
    mkdirSync(drillDir, { recursive: true });
  }

  const primaryDbPath = resolve(drillDir, 'staging-primary.db');
  const backupDbPath = resolve(drillDir, 'staging-backup.db');
  const restoredDbPath = resolve(drillDir, 'staging-restored.db');

  const origEnvKill = process.env.QWEN_KILL;

  try {
    // Clean prior runs
    for (const f of [primaryDbPath, backupDbPath, restoredDbPath]) {
      if (existsSync(f)) unlinkSync(f);
    }

    console.log('[Drill] 1. Applying base schema to primary DB...');
    const d1Dir = resolve(__dirname, '../../migrations/d1');
    const migrationFiles = ['0001-subscriptions.sql', '0002-phase33-indexes.sql', '0003-paper-trades-v3.sql'];
    const baseSql = migrationFiles.map(f => readFileSync(resolve(d1Dir, f), 'utf8')).join('\n');
    execSync(`sqlite3 "${primaryDbPath}"`, { input: baseSql, encoding: 'utf8' });

    // 1. Seed synthetic data
    console.log('[Drill] 2. Seeding synthetic subscription and paper trade data...');
    const seedSql = `
      INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, created_at, updated_at)
      VALUES
        ('sub_01', 'usr_alpha', 'PRO', 'active', 2900, 'usd', '2026-10-31 00:00:00', '2026-10-31 00:00:00'),
        ('sub_02', 'usr_beta', 'ENTERPRISE', 'active', 9900, 'usd', '2026-10-31 00:00:00', '2026-10-31 00:00:00'),
        ('sub_03', 'usr_gamma', 'FREE', 'canceled', 0, 'usd', '2026-10-31 00:00:00', '2026-10-31 00:00:00');

      INSERT INTO paper_trades_v3 (id, market_id, side, size_usd, entry_price, status, strategy, pnl, source, created_at)
      VALUES
        ('pt_01', 'tok_usdc_01', 'YES', 500.0, 0.45, 'open', 'momentum_alpha', NULL, 'paper_engine', 1700000100000),
        ('pt_02', 'tok_usdc_02', 'NO', 250.0, 0.60, 'closed', 'mean_reversion', 45.5, 'paper_engine', 1700000200000),
        ('pt_03', 'tok_usdc_03', 'YES', 1000.0, 0.50, 'closed', 'trend_following', -12.0, 'paper_engine', 1700000300000);
    `;
    execSync(`sqlite3 "${primaryDbPath}"`, { input: seedSql, encoding: 'utf8' });

    // 2. Point-in-time Backup drill
    console.log('[Drill] 3. Executing point-in-time backup drill...');
    const tBackupStart = process.hrtime.bigint();
    execSync(`sqlite3 "${primaryDbPath}" ".backup '${backupDbPath}'"`);
    const backupDuration = Number(process.hrtime.bigint() - tBackupStart) / 1_000_000;
    const backupTargetMs = 500;
    metrics.push({
      name: 'DB Backup Execution',
      targetMs: backupTargetMs,
      actualMs: parseFloat(backupDuration.toFixed(2)),
      status: (backupDuration <= backupTargetMs && existsSync(backupDbPath)) ? 'PASS' : 'FAIL',
      details: `Backup generated to ${backupDbPath} (${backupDuration.toFixed(2)}ms)`,
    });

    // 3. Restore to completely fresh isolated DB
    console.log('[Drill] 4. Executing restore into isolated secondary DB...');
    const tRestoreStart = process.hrtime.bigint();
    execSync(`sqlite3 "${restoredDbPath}" ".restore '${backupDbPath}'"`);
    const restoreDuration = Number(process.hrtime.bigint() - tRestoreStart) / 1_000_000;
    const restoreTargetMs = 500;
    metrics.push({
      name: 'DB Restore Execution',
      targetMs: restoreTargetMs,
      actualMs: parseFloat(restoreDuration.toFixed(2)),
      status: (restoreDuration <= restoreTargetMs && existsSync(restoredDbPath)) ? 'PASS' : 'FAIL',
      details: `Restored backup into ${restoredDbPath} (${restoreDuration.toFixed(2)}ms)`,
    });

    // 4. Reconcile normalized full row data and invariants
    console.log('[Drill] 5. Full normalized row-by-row data reconciliation...');
    const tReconcileStart = process.hrtime.bigint();
    const reconResult = reconcileFullDatabaseData(primaryDbPath, restoredDbPath);
    const reconDuration = Number(process.hrtime.bigint() - tReconcileStart) / 1_000_000;
    const reconTargetMs = 100;
    metrics.push({
      name: 'Backup/Restore Reconciliation Invariant',
      targetMs: reconTargetMs,
      actualMs: parseFloat(reconDuration.toFixed(2)),
      status: (reconResult.match && reconDuration <= reconTargetMs) ? 'PASS' : 'FAIL',
      details: `Normalized Row Reconciliation: ${reconResult.details} (${reconDuration.toFixed(2)}ms)`,
    });

    // 5. Candidate Migration Apply & Rollback
    console.log('[Drill] 6. Testing candidate migration apply and rollback drill...');
    const tMigrateStart = process.hrtime.bigint();
    const candidateSql = `
      ALTER TABLE paper_trades_v3 ADD COLUMN risk_score REAL DEFAULT 0.0;
      UPDATE paper_trades_v3 SET risk_score = 0.85 WHERE id = 'pt_01';
    `;
    execSync(`sqlite3 "${primaryDbPath}"`, { input: candidateSql, encoding: 'utf8' });
    const colAdded = execSync(`sqlite3 "${primaryDbPath}" "SELECT risk_score FROM paper_trades_v3 WHERE id='pt_01';"`, { encoding: 'utf8' }).trim();
    const migrationDuration = Number(process.hrtime.bigint() - tMigrateStart) / 1_000_000;
    const migrateTargetMs = 300;

    metrics.push({
      name: 'Migration Candidate Apply',
      targetMs: migrateTargetMs,
      actualMs: parseFloat(migrationDuration.toFixed(2)),
      status: (colAdded === '0.85' && migrationDuration <= migrateTargetMs) ? 'PASS' : 'FAIL',
      details: `Applied candidate DDL adding column risk_score (${migrationDuration.toFixed(2)}ms)`,
    });

    // Rollback via restore from pre-migration backup
    const tRollbackStart = process.hrtime.bigint();
    execSync(`sqlite3 "${primaryDbPath}" ".restore '${backupDbPath}'"`);
    const rollbackDuration = Number(process.hrtime.bigint() - tRollbackStart) / 1_000_000;
    const rollbackTargetMs = 500;

    // Verify rollback schema matches exact expected columns
    const columnsAfterRollback = execSync(
      `sqlite3 "${primaryDbPath}" "PRAGMA table_info(paper_trades_v3);"`,
      { encoding: 'utf8' },
    ).trim();

    const rollbackVerified = !columnsAfterRollback.includes('risk_score') &&
                             columnsAfterRollback.includes('market_id') &&
                             columnsAfterRollback.includes('entry_price');

    metrics.push({
      name: 'Migration Rollback Recovery',
      targetMs: rollbackTargetMs,
      actualMs: parseFloat(rollbackDuration.toFixed(2)),
      status: (rollbackVerified && rollbackDuration <= rollbackTargetMs) ? 'PASS' : 'FAIL',
      details: `Restored pre-migration snapshot, verified column purged from schema (${rollbackDuration.toFixed(2)}ms)`,
    });

    // 6. Paper Trading Execution Path Kill Switch Drill (Real Application Pipeline)
    console.log('[Drill] 7. Running kill switch drill during active paper execution path...');
    // 6a. Baseline proof: Paper candidate creates valid paper trade when kill switch is OFF
    const baselineResult = await executePaperTradeCandidate(primaryDbPath, {
      id: 'pt_baseline_valid',
      marketId: 'tok_poly_01',
      side: 'YES',
      sizeUsd: 100,
      price: 0.52,
      strategy: 'qwen_momentum_alpha',
      source: 'qwen',
    });

    if (!baselineResult.executed) {
      throw new Error(`Baseline paper trade failed to execute: ${baselineResult.reason}`);
    }

    const initialTradeCount = parseInt(
      execSync(`sqlite3 "${primaryDbPath}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim(),
      10,
    );

    // 6b. Active In-flight Kill: Setup synchronization barrier, trip kill switch right before mutation
    let barrierReached = false;

    const inFlightCandidate = {
      id: 'pt_in_flight_trip',
      marketId: 'tok_poly_02',
      side: 'NO' as const,
      sizeUsd: 250,
      price: 0.48,
      strategy: 'qwen_momentum_alpha',
      source: 'qwen',
      stepSyncBarrier: () => {
        // Task is in-flight (consensus/validation finished).
        // Trip kill switch right before mutation step!
        barrierReached = true;
        process.env.QWEN_KILL = '1';
      },
    };

    const tKillStart = process.hrtime.bigint();
    const inFlightResult = await executePaperTradeCandidate(primaryDbPath, inFlightCandidate);
    const killDuration = Number(process.hrtime.bigint() - tKillStart) / 1_000_000;
    const killTargetMs = 100;

    // Verify zero mutations committed under kill switch
    const tradeCountUnderKill = parseInt(
      execSync(`sqlite3 "${primaryDbPath}" "SELECT count(*) FROM paper_trades_v3;"`, { encoding: 'utf8' }).trim(),
      10,
    );
    const zeroMutations = tradeCountUnderKill === initialTradeCount && !inFlightResult.executed;

    metrics.push({
      name: 'Kill Switch Trip & Enforcement',
      targetMs: killTargetMs,
      actualMs: parseFloat(killDuration.toFixed(2)),
      status: (barrierReached && zeroMutations && killDuration <= killTargetMs) ? 'PASS' : 'FAIL',
      details: `In-flight barrier tripped, QWEN_KILL=1: executed=${inFlightResult.executed}, countDelta=${tradeCountUnderKill - initialTradeCount} (${killDuration.toFixed(2)}ms)`,
    });

    // 7. Controlled Recovery from Kill Switch
    console.log('[Drill] 8. Running controlled recovery from kill switch...');
    const tRecoveryStart = process.hrtime.bigint();
    delete process.env.QWEN_KILL;
    const killDeactivated = !isKillSwitchActive();

    let recoveryTradeCommitted = false;
    if (killDeactivated) {
      const recoveryResult = await executePaperTradeCandidate(primaryDbPath, {
        id: 'pt_recovery_01',
        marketId: 'tok_poly_03',
        side: 'YES',
        sizeUsd: 150,
        price: 0.50,
        strategy: 'qwen_momentum_alpha',
        source: 'qwen',
      });
      recoveryTradeCommitted = recoveryResult.executed;
    }
    const recoveryDuration = Number(process.hrtime.bigint() - tRecoveryStart) / 1_000_000;
    const recoveryTargetMs = 100;

    metrics.push({
      name: 'Controlled Kill-Switch Recovery',
      targetMs: recoveryTargetMs,
      actualMs: parseFloat(recoveryDuration.toFixed(2)),
      status: (killDeactivated && recoveryTradeCommitted && recoveryDuration <= recoveryTargetMs) ? 'PASS' : 'FAIL',
      details: `Deactivated kill switch, resumed normal operation verified (${recoveryDuration.toFixed(2)}ms)`,
    });

    const allPassed = metrics.every(m => m.status === 'PASS');
    return {
      success: allPassed,
      metrics,
      reconciliation: reconResult,
    };
  } finally {
    // Restore environment and cleanup drill database artifacts
    if (origEnvKill === undefined) {
      delete process.env.QWEN_KILL;
    } else {
      process.env.QWEN_KILL = origEnvKill;
    }

    for (const f of [primaryDbPath, backupDbPath, restoredDbPath]) {
      if (existsSync(f)) {
        try { unlinkSync(f); } catch {}
      }
    }
  }
}

if (require.main === module) {
  runStagingDrill().then(result => {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('  LOCAL STAGING DRILL RESULTS (LOCAL SQLITE DRILL ONLY)');
    console.log('════════════════════════════════════════════════════════');
    for (const m of result.metrics) {
      const badge = m.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
      console.log(`${badge} | ${m.name.padEnd(38)} | Target: ${m.targetMs}ms | Actual: ${m.actualMs}ms | ${m.details}`);
    }
    console.log('════════════════════════════════════════════════════════');
    console.log('Note: This is a local SQLite drill; it does not prove remote D1 recovery or production RTO.');
    if (!result.success) {
      process.exit(1);
    }
  });
}
