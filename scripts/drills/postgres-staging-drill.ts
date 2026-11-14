#!/usr/bin/env tsx
/**
 * PostgreSQL 15.17 Staging Migration, Rollback & pg_dump/pg_restore Drill
 * Verifies #5 and #9-PG (Risk R-06): preflight -> 51/51 migrations -> rollback+reapply -> dump/restore -> 0-drift digest.
 */

import { execFileSync } from 'child_process';
import { unlinkSync, existsSync, statSync } from 'fs';
import pg from 'pg';
import { runStagingPreflight } from '../staging-preflight-check';
import { MIGRATIONS, runMigrations, rollbackLastMigration, getAppliedMigrations } from '../../src/db/migration-runner';
import { closeDbConnection, getDbClient } from '../../src/db/postgres-client';

const STAGING_DB = process.env.DB_NAME || 'algo_trader_staging';
const RESTORE_DB = process.env.RESTORE_DB_NAME || 'algo_trader_staging_restored';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || '5432');
const DB_USER = process.env.DB_USER || process.env.USER || 'macbook';
const DUMP_PATH = '/tmp/algo_trader_staging_drill.dump';
const RECONCILE_TABLES = ['_migrations', 'trades', 'audit_log', 'subscriptions', 'payments', 'coupons', 'kyc_verifications'] as const;

export interface PostgresDrillReport {
  timestampIso: string;
  postgresVersion: string;
  preflightPassed: boolean;
  totalMigrationsRegistered: number;
  migrationsAppliedCount: number;
  rolledBackMigrationId: string | null;
  reappliedCount: number;
  migrationElapsedMs: number;
  dumpElapsedMs: number;
  restoreElapsedMs: number;
  totalRtoMs: number;
  dumpSizeBytes: number;
  rpoRowsLost: number;
  tableCounts: Record<string, { source: number; restored: number; driftRows: number }>;
  totalDriftRows: number;
}

async function ensureCleanDatabase(adminPool: pg.Pool, dbName: string): Promise<void> {
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
}

async function seedStagingRows(pool: pg.Pool): Promise<void> {
  await pool.query(`
    INSERT INTO trades (id, opportunity_id, execution_id, symbol, buy_exchange, sell_exchange, buy_price, sell_price, amount, spread_percent, profit, fee, status, created_at, updated_at)
    VALUES
      ('trd-drill-1', 'opp-1', 'exec-1', 'BTC/USDT', 'binance', 'okx', 91200.0, 91250.5, 0.25, 0.0554, 12.625, 0.45, 'filled', 1794085000000, 1794085000100),
      ('trd-drill-2', 'opp-2', 'exec-2', 'ETH/USDT', 'okx', 'bybit', 3115.0, 3120.0, 1.50, 0.1605, 7.50, 0.30, 'filled', 1794085001000, 1794085001100)
  `);
  await pool.query(`
    INSERT INTO audit_log (id, actor, tenant_id, action, resource, result, metadata, ip_hash, sequence_number, previous_hash, hash)
    VALUES
      ('aud-drill-1', 'system', 'tenant-alpha', 'trade.create', 'orders/trd-drill-1', 'success', '{"env":"staging"}'::jsonb, 'sha256:ip1', 1, '', encode(digest('tenant-alpha|1||aud-drill-1', 'sha256'), 'hex')),
      ('aud-drill-2', 'system', 'tenant-alpha', 'trade.close', 'orders/trd-drill-2', 'success', '{"env":"staging"}'::jsonb, 'sha256:ip2', 2, encode(digest('tenant-alpha|1||aud-drill-1', 'sha256'), 'hex'), encode(digest('tenant-alpha|2|prev|aud-drill-2', 'sha256'), 'hex'))
  `);
  await pool.query(`
    INSERT INTO subscriptions (id, provider_payment_id, customer_email, tier, status, current_period_start, current_period_end, amount, currency)
    VALUES ('sub-drill-1', 'np_pay_001', 'ops-drill@cashclaw.cc', 'PRO', 'active', NOW(), NOW() + INTERVAL '30 days', 49.00, 'USDT')
  `);
  await pool.query(`
    INSERT INTO payments (id, provider_payment_id, subscription_id, customer_email, amount, currency, status)
    VALUES ('pay-drill-1', 'np_pay_001', 'sub-drill-1', 'ops-drill@cashclaw.cc', 49.00, 'USDT', 'success')
  `);
  await pool.query(`
    INSERT INTO coupons (code, discount_percent, max_uses, current_uses, active)
    VALUES ('DRILL2026', 20, 100, 1, true)
  `);
  await pool.query(`
    INSERT INTO kyc_verifications (tenant_id, provider, status, verification_level, provider_reference)
    VALUES ('tenant-alpha', 'persona', 'approved', 'advanced', 'inq_drill_20261108')
  `);
}

async function computeTableDigest(pool: pg.Pool, table: string): Promise<{ count: number; rowsHash: string[] }> {
  const res = await pool.query<{ row_hash: string }>(
    `SELECT md5(row_to_json(t)::text) AS row_hash FROM "${table}" t ORDER BY 1`,
  );
  return { count: res.rowCount ?? 0, rowsHash: res.rows.map((r) => r.row_hash) };
}

export async function runPostgresStagingDrill(): Promise<PostgresDrillReport> {
  process.env.ENVIRONMENT = 'staging';
  process.env.TARGET_ENV = 'staging';
  process.env.DB_HOST = DB_HOST;
  process.env.DB_PORT = String(DB_PORT);
  process.env.DB_NAME = STAGING_DB;
  process.env.DB_USER = DB_USER;
  process.env.LIVE_TRADING_ENABLED = 'false';
  process.env.POLYMARKET_TRADING_MODE = 'PAPER';

  const preflight = runStagingPreflight();
  if (!preflight.success) {
    throw new Error(`Staging preflight failed: ${preflight.errors.join('; ')}`);
  }

  const adminPool = new pg.Pool({ host: DB_HOST, port: DB_PORT, database: 'postgres', user: DB_USER });
  const versionRes = await adminPool.query<{ server_version: string }>('SHOW server_version');
  const postgresVersion = versionRes.rows[0]?.server_version ?? 'unknown';

  await ensureCleanDatabase(adminPool, STAGING_DB);
  await ensureCleanDatabase(adminPool, RESTORE_DB);

  const migStartNs = process.hrtime.bigint();
  await runMigrations();
  const appliedInitial = await getAppliedMigrations();
  const rolledBackId = await rollbackLastMigration();
  await runMigrations();
  const appliedFinal = await getAppliedMigrations();
  const migrationElapsedMs = Number(process.hrtime.bigint() - migStartNs) / 1e6;

  const stagingPool = getDbClient();
  await seedStagingRows(stagingPool);

  if (existsSync(DUMP_PATH)) unlinkSync(DUMP_PATH);
  const dumpStartNs = process.hrtime.bigint();
  execFileSync('pg_dump', ['-h', DB_HOST, '-p', String(DB_PORT), '-U', DB_USER, '-Fc', '-f', DUMP_PATH, STAGING_DB]);
  const dumpElapsedMs = Number(process.hrtime.bigint() - dumpStartNs) / 1e6;
  const dumpSizeBytes = statSync(DUMP_PATH).size;

  const restoreStartNs = process.hrtime.bigint();
  execFileSync('pg_restore', [
    '-h', DB_HOST, '-p', String(DB_PORT), '-U', DB_USER,
    '--no-owner', '--no-acl', '-d', RESTORE_DB, DUMP_PATH,
  ]);
  const restoreElapsedMs = Number(process.hrtime.bigint() - restoreStartNs) / 1e6;
  const totalRtoMs = Number((dumpElapsedMs + restoreElapsedMs).toFixed(2));

  const restoredPool = new pg.Pool({ host: DB_HOST, port: DB_PORT, database: RESTORE_DB, user: DB_USER });
  const tableCounts: Record<string, { source: number; restored: number; driftRows: number }> = {};
  let totalDriftRows = 0;

  for (const tbl of RECONCILE_TABLES) {
    const src = await computeTableDigest(stagingPool, tbl);
    const rst = await computeTableDigest(restoredPool, tbl);
    const maxLen = Math.max(src.rowsHash.length, rst.rowsHash.length);
    let driftRows = 0;
    for (let i = 0; i < maxLen; i += 1) {
      if (src.rowsHash[i] !== rst.rowsHash[i]) driftRows += 1;
    }
    tableCounts[tbl] = { source: src.count, restored: rst.count, driftRows };
    totalDriftRows += driftRows;
  }

  await restoredPool.end();
  await closeDbConnection();
  await adminPool.end();
  if (existsSync(DUMP_PATH)) unlinkSync(DUMP_PATH);

  return {
    timestampIso: new Date().toISOString(),
    postgresVersion,
    preflightPassed: preflight.success,
    totalMigrationsRegistered: MIGRATIONS.length,
    migrationsAppliedCount: appliedInitial.size,
    rolledBackMigrationId: rolledBackId,
    reappliedCount: appliedFinal.size,
    migrationElapsedMs: Number(migrationElapsedMs.toFixed(2)),
    dumpElapsedMs: Number(dumpElapsedMs.toFixed(2)),
    restoreElapsedMs: Number(restoreElapsedMs.toFixed(2)),
    totalRtoMs,
    dumpSizeBytes,
    rpoRowsLost: totalDriftRows,
    tableCounts,
    totalDriftRows,
  };
}

if (require.main === module) {
  runPostgresStagingDrill()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (report.totalDriftRows !== 0 || report.reappliedCount !== report.totalMigrationsRegistered) {
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`[PostgresStagingDrill] FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}
