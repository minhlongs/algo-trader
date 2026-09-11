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
import { getDialect, parseAndRewriteSql } from './migration-sql-dialect';
import { executeMigrationDown } from './migration-down-handlers';

export { getDialect, parseAndRewriteSql } from './migration-sql-dialect';
export { executeMigrationDown } from './migration-down-handlers';

// Migration interface
interface Migration {
  id: string;
  description: string;
  up: (client: import('pg').PoolClient) => Promise<void>;
  down: (client: import('pg').PoolClient) => Promise<void>;
}

export function createSqlMigration(filename: string, id: string, description: string): Migration {
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
      await executeMigrationDown(client, id);
    },
  };
}

// Ordered list of all migrations
export const MIGRATIONS: Migration[] = [
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
export async function ensureMigrationsTable(): Promise<void> {
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
export async function getAppliedMigrations(): Promise<Set<string>> {
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
