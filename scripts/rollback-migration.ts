/**
 * Rollback Migration Script
 * Reverts applied database migrations in reverse order.
 *
 * Usage: npx ts-node scripts/rollback-migration.ts <migration_number>
 *
 * Example: npx ts-node scripts/rollback-migration.ts 42
 *   Reverts migrations 042 and any later migrations in reverse order.
 *
 * The script connects to the database, reads the _migrations table,
 * and calls down() on each migration whose id prefix >= the given number.
 */

import 'dotenv/config';
import { getDbClient } from '../src/shared/db/postgres-client';
import { logger } from '../src/shared/utils/logger';

// Import all migrations (same list as migration-runner.ts)
import * as migration001 from '../src/shared/db/migrations/001-create-trades-table';
import * as migration004 from '../src/shared/db/migrations/004-better-auth-tables';
import * as migration010 from '../src/shared/db/migrations/010-citadel-attestations';
import * as migration011 from '../src/shared/db/migrations/011-sandbox-invocations';
import * as migration012 from '../src/shared/db/migrations/012-ironclaw-audit';
import * as migration014 from '../src/shared/db/migrations/014-signal-feed';
import * as migration015 from '../src/shared/db/migrations/015-subscriber-attribution';
import * as migration016 from '../src/shared/db/migrations/016-qwen-paper-tracking';
import * as migration017 from '../src/shared/db/migrations/017-strategy-review-tasks';
import * as migration018 from '../src/shared/db/migrations/018-qwen-signals-loop-runs';
import * as migration019 from '../src/shared/db/migrations/019_add_trades_composite_index';
import * as migration020 from '../src/shared/db/migrations/020_db_performance_optimizations';
import * as migration021 from '../src/shared/db/migrations/021-tenant-audit';
import * as migration022 from '../src/shared/db/migrations/022-dna-journal';
import * as migration023 from '../src/shared/db/migrations/023-dna-engine-state';
import * as migration024 from '../src/shared/db/migrations/024-create-referral-tables';
import * as migration025 from '../src/shared/db/migrations/025-marketplace-schema';
import * as migration026 from '../src/shared/db/migrations/026-create-ai-audit-tables';
import * as migration027 from '../src/shared/db/migrations/027-usage-metering-schema';
import * as migration028 from '../src/shared/db/migrations/028-tenant-audit-logs';
import * as migration029 from '../src/shared/db/migrations/029-tenant-credentials';
import * as migration030 from '../src/shared/db/migrations/030_create_marketplace_tables';
import * as migration031 from '../src/shared/db/migrations/031-add-marketplace-subscription-payment';
import * as migration032 from '../src/shared/db/migrations/032-add-marketplace-payout-address';
import * as migration033 from '../src/shared/db/migrations/033-add-marketplace-performance-indexes';
import * as migration034 from '../src/shared/db/migrations/034-add-marketplace-backtests';
import * as migration035 from '../src/shared/db/migrations/035-add-blog-engagement-tables';
import * as migration036 from '../src/shared/db/migrations/036-add-kyc-verifications';
import * as migration037 from '../src/shared/db/migrations/037-add-newsletter-preferences';
import * as migration038 from '../src/shared/db/migrations/038-add-community-strategies';
import * as migration039 from '../src/shared/db/migrations/039-add-api-keys';
import * as migration040 from '../src/shared/db/migrations/040-add-listing-badges';
import * as migration041 from '../src/shared/db/migrations/041-add-subscription-improvements';
import * as migration042 from '../src/shared/db/migrations/042-add-dunning-state';

interface Migration {
  id: string;
  description: string;
  up: (client: import('pg').PoolClient) => Promise<void>;
  down: (client: import('pg').PoolClient) => Promise<void>;
}

// Canonical ordered migration list (must match migration-runner.ts)
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
];

/**
 * Parse a migration id to extract its numeric prefix.
 * e.g. "042-add-dunning-state" -> 42
 */
function parseMigrationNumber(id: string): number {
  const match = id.match(/^(\d+)/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

async function rollback(fromNumber: number): Promise<void> {
  // Validate migration number
  if (fromNumber < 1 || isNaN(fromNumber)) {
    console.error(`Error: Invalid migration number "${fromNumber}". Must be a positive integer.`);
    process.exit(1);
  }

  const pool = getDbClient();

  // Ensure _migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id VARCHAR(128) PRIMARY KEY,
      description TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get applied migrations from DB
  const result = await pool.query<{ id: string }>(
    'SELECT id FROM _migrations ORDER BY applied_at'
  );
  const appliedIds = new Set(result.rows.map((r) => r.id));

  // Find migrations to rollback: those with number >= fromNumber AND applied
  const toRollback = MIGRATIONS.filter((m) => {
    const num = parseMigrationNumber(m.id);
    return num >= fromNumber && appliedIds.has(m.id);
  }).reverse(); // Reverse order: newest first

  if (toRollback.length === 0) {
    console.log(`No applied migrations found with number >= ${fromNumber}. Nothing to rollback.`);
    process.exit(0);
  }

  console.log(`Rolling back ${toRollback.length} migration(s) in reverse order...`);

  for (const migration of toRollback) {
    const client = await pool.connect();
    try {
      console.log(`[Rollback] Reverting: ${migration.id} - ${migration.description}`);
      await client.query('BEGIN');
      await migration.down(client);
      await client.query(
        'DELETE FROM _migrations WHERE id = $1',
        [migration.id]
      );
      await client.query('COMMIT');
      console.log(`[Rollback] Reverted: ${migration.id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Rollback] FAILED: ${migration.id}`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[Rollback] All specified migrations reverted successfully.');
}

// Parse CLI argument
const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error('Usage: npx ts-node scripts/rollback-migration.ts <migration_number>');
  console.error('Example: npx ts-node scripts/rollback-migration.ts 42');
  console.error('  Reverts migration 042 and any later migrations in reverse order.');
  process.exit(1);
}

const fromNumber = parseInt(migrationArg, 10);

rollback(fromNumber).catch((err) => {
  console.error('[Rollback] Fatal error:', err);
  process.exit(1);
});
