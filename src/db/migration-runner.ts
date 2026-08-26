/**
 * Migration Runner
 * Tracks and runs pending DB migrations on startup
 * Uses _migrations table to record applied migrations
 */

import { logger } from '../shared/utils/logger';
import { getDbClient } from './postgres-client';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as migration001 from './migrations/001-create-trades-table';
import * as migration002 from './migrations/002-phase33-indexes';
import * as migration019 from './migrations/019_add_trades_composite_index';
import * as migration020 from './migrations/020_db_performance_optimizations';
import * as migration025 from './migrations/025-marketplace-schema';
import * as migration026 from './migrations/026-create-ai-audit-tables';
import * as migration030 from './migrations/030_create_marketplace_tables';
import * as migration038 from './migrations/038-audit-log';
import * as migration039 from './migrations/039-audit-log-tenant';
import * as migration040 from './migrations/040-audit-immutability';
import * as migration041 from './migrations/041-audit-hash-chain';
import * as migration045 from './migrations/045-ohlcv-candles';
import * as migration046 from './migrations/046-ab-test-experiments';
import * as migration047 from './migrations/047-model-registry';
import * as migration049 from './migrations/049-funding-rates';
import * as migration035 from '../shared/db/migrations/035-add-blog-engagement-tables';
import * as migration037 from '../shared/db/migrations/037-add-newsletter-preferences';
import * as migration055 from '../shared/db/migrations/055-add-blog-page-views';

// Migration interface
interface Migration {
  id: string;
  description: string;
  up: (client: import('pg').PoolClient) => Promise<void>;
  down: (client: import('pg').PoolClient) => Promise<void>;
}

function getDialect(client: unknown): 'postgres' | 'sqlite' {
  if (client && typeof client === 'object' && 'constructor' in client) {
    const ctor = (client as { constructor: () => unknown }).constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name.includes('Client')) {
      return 'postgres';
    }
  }
  if (process.env.DB_HOST || process.env.DB_NAME) {
    return 'postgres';
  }
  return 'sqlite';
}

function parseAndRewriteSql(rawSql: string, dialect: 'postgres' | 'sqlite'): string {
  let sql = rawSql;
  if (dialect === 'postgres') {
    // Replace SQLite strftime with Postgres equivalent
    sql = sql.replace(/strftime\(\s*['"]%s['"]\s*,\s*['"]now['"]\s*\)\s*\*\s*1000/g, "(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint");
    sql = sql.replace(/strftime\(\s*['"]%s['"]\s*,\s*['"]now['"]\s*\)/g, "EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint");
    sql = sql.replace(/\bAUTOINCREMENT\b/gi, '');
  } else {
    // Replace PostgreSQL gen_random_uuid() with hex(randomblob())
    sql = sql.replace(/gen_random_uuid\(\)::text/gi, "(lower(hex(randomblob(16))))");
    sql = sql.replace(/gen_random_uuid\(\)/gi, "(lower(hex(randomblob(16))))");
    // Replace EXTRACT(EPOCH FROM NOW()) with strftime('%s','now')
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)\s*\*\s*1000::bigint/gi, "(strftime('%s','now') * 1000)");
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)::bigint\s*\*\s*1000/gi, "(strftime('%s','now') * 1000)");
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)\s*\*\s*1000/gi, "(strftime('%s','now') * 1000)");
    sql = sql.replace(/EXTRACT\(EPOCH FROM (?:NOW\(\)|CURRENT_TIMESTAMP)\)/gi, "strftime('%s','now')");
    sql = sql.replace(/::bigint/gi, '');
    sql = sql.replace(/::text/gi, '');
    sql = sql.replace(/\bUUID\b/gi, 'TEXT');
    sql = sql.replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP');
    sql = sql.replace(/\bJSONB\b/gi, 'TEXT');
    sql = sql.replace(/\bTEXT\[\]\b/gi, 'TEXT');
    sql = sql.replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP");
    sql = sql.replace(/\(\(created_at\s+AT\s+TIME\s+ZONE\s+['"]UTC['"]\)::date\)/gi, "date(created_at)");
  }
  return sql;
}

function createSqlMigration(filename: string, id: string, description: string): Migration {
  return {
    id,
    description,
    up: async (client) => {
      const sqlPath = join(__dirname, 'migrations', filename);
      const rawSql = readFileSync(sqlPath, 'utf8');
      const dialect = getDialect(client);
      const rewrittenSql = parseAndRewriteSql(rawSql, dialect);
      // Run the entire script (pg and sqlite both support multi-statement queries without params)
      await client.query(rewrittenSql);
    },
    down: async (client) => {
      if (id === '004_better_auth_tables') {
        await client.query('DROP TABLE IF EXISTS verification CASCADE');
        await client.query('DROP TABLE IF EXISTS account CASCADE');
        await client.query('DROP TABLE IF EXISTS session CASCADE');
        await client.query('DROP TABLE IF EXISTS "user" CASCADE');
      } else if (id === '005_compliance_kyc_tables') {
        await client.query('DROP TABLE IF EXISTS compliance_transactions CASCADE');
        await client.query('DROP TABLE IF EXISTS kyc_submissions CASCADE');
      } else if (id === '014_signal_feed') {
        await client.query('DROP TABLE IF EXISTS signal_delivery_log CASCADE');
        await client.query('DROP TABLE IF EXISTS signal_subscriptions CASCADE');
        await client.query('DROP TABLE IF EXISTS signals CASCADE');
      } else if (id === '015_subscriber_attribution') {
        await client.query('DROP TABLE IF EXISTS subscriber_equity_snapshots CASCADE');
        try {
          await client.query('ALTER TABLE trades DROP COLUMN IF EXISTS subscriber_id');
          await client.query('ALTER TABLE trades DROP COLUMN IF EXISTS attestation_id');
          await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS subscriber_id');
        } catch {}
      } else if (id === '016_qwen_paper_tracking') {
        await client.query('DROP TABLE IF EXISTS paper_trades_v3 CASCADE');
        try {
          await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS source');
          await client.query('ALTER TABLE signals DROP COLUMN IF EXISTS paper_only');
        } catch {}
      } else if (id === '017_strategy_review_tasks') {
        await client.query('DROP TABLE IF EXISTS strategy_review_tasks CASCADE');
      } else if (id === '018_qwen_signals_loop_runs') {
        await client.query('DROP TABLE IF EXISTS qwen_signals_loop_runs CASCADE');
      } else if (id === '021_create_tenant_audit_logs') {
        await client.query('DROP TABLE IF EXISTS tenant_audit_logs CASCADE');
      } else if (id === '021_tenant_credentials') {
        await client.query('DROP TABLE IF EXISTS tenant_credentials CASCADE');
      } else if (id === '042_add_encrypted_credential_columns') {
        await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS api_key_encrypted');
        await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS api_secret_encrypted');
        await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS passphrase_encrypted');
        await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS private_key_encrypted');
        await client.query('ALTER TABLE tenant_credentials DROP COLUMN IF EXISTS public_key');
        await client.query('DROP INDEX IF EXISTS idx_tenant_credentials_api_key_encrypted');
        await client.query('DROP INDEX IF EXISTS idx_tenant_credentials_api_secret_encrypted');
      } else if (id === '0002-phase33-indexes') {
  await client.query('DROP INDEX IF EXISTS idx_payment_logs_created');
  await client.query('DROP INDEX IF EXISTS idx_orders_user_created');
  await client.query('DROP INDEX IF EXISTS idx_coupons_redeemed');
} else if (id === '048-prediction-history') {
        await client.query('DROP TABLE IF EXISTS prediction_history CASCADE');
      }
    }
  };
}

// Ordered list of all migrations
const MIGRATIONS: Migration[] = [
  migration001,
  createSqlMigration('004_better_auth_tables.sql', '004_better_auth_tables', 'Better Auth Schema Migration'),
  createSqlMigration('005_compliance_kyc_tables.sql', '005_compliance_kyc_tables', 'Compliance and KYC tables'),
  createSqlMigration('014_signal_feed.sql', '014_signal_feed', 'Signal feed tables'),
  createSqlMigration('015_subscriber_attribution.sql', '015_subscriber_attribution', 'Subscriber Attribution'),
  createSqlMigration('016_qwen_paper_tracking.sql', '016_qwen_paper_tracking', 'Qwen paper-trading tracking'),
  createSqlMigration('017_strategy_review_tasks.sql', '017_strategy_review_tasks', 'Strategy review tasks queue'),
  createSqlMigration('018_qwen_signals_loop_runs.sql', '018_qwen_signals_loop_runs', 'Qwen signals loop run journal'),
  migration019,
  migration020,
  createSqlMigration('021_create_tenant_audit_logs.sql', '021_create_tenant_audit_logs', 'Create Tenant Audit Logs Table'),
  createSqlMigration('021_tenant_credentials.sql', '021_tenant_credentials', 'Tenant Credentials Table'),
  createSqlMigration('022_dna_journal.sql', '022_dna_journal', 'DNA engine multi-TF consensus journal'),
  createSqlMigration('023_dna_engine_state.sql', '023_dna_engine_state', 'DNA engine state persistence'),
  createSqlMigration('024_create_referral_tables.sql', '024_create_referral_tables', 'Referral tables'),
  migration025,
  migration026,
  createSqlMigration('027-usage-metering-schema.sql', '027-usage-metering-schema', 'Usage metering schema'),
  createSqlMigration('029_tenant_credentials.sql', '029_tenant_credentials', 'Tenant Credentials Table v2'),
  createSqlMigration('042_add_encrypted_credential_columns.sql', '042_add_encrypted_credential_columns', 'Add encrypted credential columns'),
  migration030,
  createSqlMigration('031_add_marketplace_subscription_payment.sql', '031_add_marketplace_subscription_payment', 'Marketplace subscription and payment tables'),
  createSqlMigration('032_add_marketplace_payout_address.sql', '032_add_marketplace_payout_address', 'Marketplace payout address support'),
  migration038,
  migration039,
  migration040,
  migration041,
  migration045,
  migration046,
  migration047,
  migration049,
  migration035,
  migration037,
  migration055,
  migration002, // Phase 33 composite indexes — runs after all tables exist (025-031 create them)
  createSqlMigration('048-prediction-history.sql', '048-prediction-history', 'Prediction history table (migrate from predictions.json)'),
];

/**
 * Ensure the _migrations tracking table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  const pool = getDbClient();
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  } catch (err) {
    logger.warn('[Migrations] Could not create pgcrypto extension:', err);
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id VARCHAR(128) PRIMARY KEY,
      description TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Get list of already-applied migration IDs
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getDbClient();
  const result = await pool.query<{ id: string }>('SELECT id FROM _migrations ORDER BY applied_at');
  return new Set(result.rows.map(r => r.id));
}

/**
 * Run all pending migrations in order
 */
export async function runMigrations(): Promise<void> {
  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const pending = MIGRATIONS.filter(m => !applied.has(m.id));
    if (pending.length === 0) {
      logger.info('[Migrations] All migrations up to date');
      return;
    }

    logger.info(`[Migrations] Running ${pending.length} pending migration(s)...`);

    const pool = getDbClient();
    for (const migration of pending) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await migration.up(client);
        await client.query(
          'INSERT INTO _migrations (id, description) VALUES ($1, $2)',
          [migration.id, migration.description]
        );
        await client.query('COMMIT');
        logger.info(`[Migrations] Applied: ${migration.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`[Migrations] Failed: ${migration.id}`, { error: err });
        throw err;
      } finally {
        client.release();
      }
    }

    logger.info('[Migrations] All pending migrations applied');
  } catch (err) {
    logger.error('[Migrations] Migration runner error:', { error: err });
    throw err;
  }
}
