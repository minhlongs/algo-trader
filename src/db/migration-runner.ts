/**
 * Migration Runner
 * Tracks and runs pending DB migrations on startup
 * Uses _migrations table to record applied migrations
 */

import { logger } from '../shared/utils/logger';
import { assertStagingEnvironmentSafe } from '../shared/preflight/staging-guard';
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
import * as migration042Shared from '../shared/db/migrations/042-add-dunning-state';
import * as migration043Shared from '../shared/db/migrations/043-add-billing-subscriptions';
import * as migration044Shared from '../shared/db/migrations/044-add-billing-payments';
import * as migration045Shared from '../shared/db/migrations/045-add-billing-licenses';
import * as migration046Shared from '../shared/db/migrations/046-add-billing-coupons';
import * as migration047Shared from '../shared/db/migrations/047-add-billing-drip-subscribers';
import * as migration048Shared from '../shared/db/migrations/048-add-billing-enterprise-inquiries';
import * as migration049Shared from '../shared/db/migrations/049-add-billing-api-keys';
import * as migration050Shared from '../shared/db/migrations/050-add-billing-onboarding-signups';
import * as migration051Shared from '../shared/db/migrations/051-add-usage-metering';
import * as migration052Shared from '../shared/db/migrations/052-add-starter-tier-and-billing-interval';
import * as migration053Shared from '../shared/db/migrations/053-add-telegram-sessions';
import * as migration055 from '../shared/db/migrations/055-add-blog-page-views';
import * as migration056Shared from '../shared/db/migrations/056-add-kyc-verifications';
import * as migration057Shared from '../shared/db/migrations/057-add-usage-metrics-table';
import * as migration058Shared from '../shared/db/migrations/058-add-usage-metrics-alerted-thresholds';
import * as migration059Shared from '../shared/db/migrations/059-add-usage-metrics-mcu-units';
import {
  rollbackMigration as executeRollbackMigration,
  rollbackLastMigration as executeRollbackLastMigration,
} from './migration-rollback';
import {
  type Migration,
  createSqlMigration,
  ensureMigrationsTable,
  getAppliedMigrations,
  applyPendingMigrations,
} from './migration-runner-helpers';

export { getDialect, parseAndRewriteSql } from './migration-sql-dialect';
export { executeMigrationDown } from './migration-down-handlers';
export { executeRollbackMigration, executeRollbackLastMigration };
export {
  type Migration,
  createSqlMigration,
  ensureMigrationsTable,
  getAppliedMigrations,
  applyPendingMigrations,
};

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
  migration042Shared,
  migration043Shared,
  migration044Shared,
  migration045Shared,
  migration046Shared,
  migration047Shared,
  migration048Shared,
  migration049Shared,
  migration050Shared,
  migration051Shared,
  migration052Shared,
  migration053Shared,
  migration055,
  migration056Shared,
  migration057Shared,
  migration058Shared,
  migration059Shared,
  migration002, // Phase 33 composite indexes — runs after all tables exist (025-031 create them)
  createSqlMigration('048-prediction-history.sql', '048-prediction-history', 'Prediction history table (migrate from predictions.json)'),
];

/**
 * Run all pending migrations in order
 */
export async function runMigrations(): Promise<void> {
  try {
    const envName = (process.env.ENVIRONMENT || process.env.NODE_ENV || '').toLowerCase();
    // Fail-closed guard: run staging safety assertions when explicitly targeting staging,
    // or when ENVIRONMENT is staging even when NODE_ENV is erroneously set to production.
    if (envName === 'staging' || (process.env.ENVIRONMENT || '').toLowerCase() === 'staging') {
      assertStagingEnvironmentSafe({
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        d1Id: process.env.CLOUDFLARE_D1_DATABASE_ID,
        kvId: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
        liveTradingEnabled: process.env.LIVE_TRADING_ENABLED,
        polymarketTradingMode: process.env.POLYMARKET_TRADING_MODE,
      }, {
        requireDbFields: true,
      });
    }

    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const pending = MIGRATIONS.filter(m => !applied.has(m.id));
    if (pending.length === 0) {
      logger.info('[Migrations] All migrations up to date');
      return;
    }

    logger.info(`[Migrations] Running ${pending.length} pending migration(s)...`);
    await applyPendingMigrations(pending);
    logger.info('[Migrations] All pending migrations applied');
  } catch (err) {
    logger.error('[Migrations] Migration runner error:', { error: err });
    throw err;
  }
}

/**
 * Roll back a specific applied migration by ID.
 */
export async function rollbackMigration(id: string): Promise<void> {
  return executeRollbackMigration(id, MIGRATIONS);
}

/**
 * Roll back the most recently applied migration.
 */
export async function rollbackLastMigration(): Promise<string | null> {
  return executeRollbackLastMigration(MIGRATIONS);
}
