/**
 * Migration Runner
 * Tracks and runs pending DB migrations on startup
 * Uses _migrations table to record applied migrations
 */

import { logger } from '../utils/logger';
import { getDbClient } from './postgres-client';
import * as migration001 from './migrations/001-create-trades-table';
import * as migration004 from './migrations/004-better-auth-tables';
import * as migration010 from './migrations/010-citadel-attestations';
import * as migration011 from './migrations/011-sandbox-invocations';
import * as migration012 from './migrations/012-ironclaw-audit';
import * as migration014 from './migrations/014-signal-feed';
import * as migration015 from './migrations/015-subscriber-attribution';
import * as migration016 from './migrations/016-qwen-paper-tracking';
import * as migration017 from './migrations/017-strategy-review-tasks';
import * as migration018 from './migrations/018-qwen-signals-loop-runs';
import * as migration019 from './migrations/019_add_trades_composite_index';
import * as migration020 from './migrations/020_db_performance_optimizations';
import * as migration021 from './migrations/021-tenant-audit';
import * as migration022 from './migrations/022-dna-journal';
import * as migration023 from './migrations/023-dna-engine-state';
import * as migration024 from './migrations/024-create-referral-tables';
import * as migration025 from './migrations/025-marketplace-schema';
import * as migration026 from './migrations/026-create-ai-audit-tables';
import * as migration027 from './migrations/027-usage-metering-schema';
import * as migration028 from './migrations/028-tenant-audit-logs';
import * as migration029 from './migrations/029-tenant-credentials';
import * as migration030 from './migrations/030_create_marketplace_tables';
import * as migration031 from './migrations/031-add-marketplace-subscription-payment';
import * as migration032 from './migrations/032-add-marketplace-payout-address';
import * as migration033 from './migrations/033-add-marketplace-performance-indexes';
import * as migration034 from './migrations/034-add-marketplace-backtests';
import * as migration035 from './migrations/035-add-blog-engagement-tables';
import * as migration036 from './migrations/036-add-kyc-verifications';
import * as migration037 from './migrations/037-add-newsletter-preferences';
import * as migration038 from './migrations/038-add-community-strategies';
import * as migration039 from './migrations/039-add-api-keys';
import * as migration040 from './migrations/040-add-listing-badges';
import * as migration041 from './migrations/041-add-subscription-improvements';
import * as migration042 from './migrations/042-add-dunning-state';
import * as migration043 from './migrations/043-add-billing-subscriptions';
import * as migration044 from './migrations/044-add-billing-payments';
import * as migration045 from './migrations/045-add-billing-licenses';
import * as migration046 from './migrations/046-add-billing-coupons';
import * as migration047 from './migrations/047-add-billing-drip-subscribers';
import * as migration048 from './migrations/048-add-billing-enterprise-inquiries';
import * as migration049 from './migrations/049-add-billing-api-keys';
import * as migration050 from './migrations/050-add-billing-onboarding-signups';
import * as migration051 from './migrations/051-add-usage-metering';

// Migration interface
interface Migration {
  id: string;
  description: string;
  up: (client: import('pg').PoolClient) => Promise<void>;
  down: (client: import('pg').PoolClient) => Promise<void>;
}

// Ordered list of all migrations
const MIGRATIONS: Migration[] = [
  migration001,
  migration004,
  migration010,
  migration011,
  migration012,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
  migration019,
  migration020,
  migration021,
  migration022,
  migration023,
  migration024,
  migration025,
  migration026,
  migration027,
  migration028,
  migration029,
  migration030,
  migration031,
  migration032,
  migration033,
  migration034,
  migration035,
  migration036,
  migration037,
  migration038,
  migration039,
  migration040,
  migration041,
  migration042,
  migration043,
  migration044,
  migration045,
  migration046,
  migration047,
  migration048,
  migration049,
  migration050,
  migration051,
];

/**
 * Ensure the _migrations tracking table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  const pool = getDbClient();
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
