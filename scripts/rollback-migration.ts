/**
 * Rollback Migration Script
 * Reverts applied database migrations in reverse order.
 *
 * Usage: npx ts-node scripts/rollback-migration.ts <migration_number>
 * Example: npx ts-node scripts/rollback-migration.ts 42
 *
 * Migrations are auto-discovered from src/shared/db/migrations/ via glob require.
 * No manual import updates needed — new migrations are picked up automatically.
 */

import 'dotenv/config';
import { getDbClient } from '../src/shared/db/postgres-client';
import { logger } from '../src/shared/utils/logger';
import { globSync } from 'glob';

// ── Auto-discover all .ts migration modules ───────────────────────────────────
// Each migration file exports: id, description, up(client), down(client)
interface Migration {
  id: string;
  description: string;
  up: (client: import('pg').PoolClient) => Promise<void>;
  down: (client: import('pg').PoolClient) => Promise<void>;
}

function discoverMigrations(): Migration[] {
  const baseDir = new URL('../src/shared/db/migrations/', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1'); // strip leading / on Windows

  const files = globSync(`${baseDir}/*.ts`, { absolute: false });
  const modules: Migration[] = [];

  for (const file of files) {
    // require is synchronous here (cached after first load)
    const mod = require(`../src/shared/db/migrations/${file}`).default;
    if (mod?.id && typeof mod.up === 'function') {
      modules.push(mod as Migration);
    }
  }

  // Sort by id string (numeric prefix + name) for deterministic order
  modules.sort((a, b) => a.id.localeCompare(b.id));
  return modules;
}

const MIGRATIONS = discoverMigrations();

// ── CLI ───────────────────────────────────────────────────────────────────────
const targetId = process.argv[2];
if (!targetId) {
  console.error('Usage: npx ts-node scripts/rollback-migration.ts <migration_id>');
  console.error('Example: npx ts-node scripts/rollback-migration.ts 042');
  console.error('');
  console.error(`Discovered ${MIGRATIONS.length} migrations:`);
  for (const m of MIGRATIONS) {
    console.error(`  ${m.id}: ${m.description}`);
  }
  process.exit(1);
}

// ── Rollback ──────────────────────────────────────────────────────────────────
async function rollback(): Promise<void> {
  const pool = getDbClient();

  // Find migrations at or after the target id
  const toRevert = MIGRATIONS.filter(m => m.id >= targetId);

  if (toRevert.length === 0) {
    console.log(`No migrations at or after ${targetId}`);
    return;
  }

  console.log(`Reverting ${toRevert.length} migration(s) from ${targetId}...`);

  // Reverse order: newest first
  for (const migration of [...toRevert].reverse()) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await migration.down(client);
      await client.query('DELETE FROM _migrations WHERE id = $1', [migration.id]);
      await client.query('COMMIT');
      logger.info(`[Rollback] Reverted: ${migration.id}`);
      console.log(`  [OK] ${migration.id}: ${migration.description}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[Rollback] Failed: ${migration.id}`, { error: err });
      console.error(`  [FAIL] ${migration.id}: ${err}`);
      process.exitCode = 1;
    } finally {
      client.release();
    }
  }

  console.log('Rollback complete.');
}

rollback().catch(err => {
  logger.error('[Rollback] Fatal error', { error: err });
  console.error(`Fatal: ${err}`);
  process.exit(1);
});
