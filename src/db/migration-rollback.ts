/**
 * Migration Rollback Handler
 * Provides safe, transactional rollback execution for database migrations.
 */

import type { PoolClient } from 'pg';
import { logger } from '../shared/utils/logger';
import { getDbClient } from './postgres-client';
import { executeMigrationDown } from './migration-down-handlers';

export interface RollbackTargetMigration {
  id: string;
  description: string;
  up?: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
}

/**
 * Roll back a specific applied migration by ID.
 * Executes down handler within a transaction and removes the migration entry from _migrations.
 */
export async function rollbackMigration(
  migrationId: string,
  migrations?: RollbackTargetMigration[]
): Promise<void> {
  const pool = getDbClient();
  const client = await pool.connect();

  try {
    const migration = migrations?.find((m) => m.id === migrationId);

    logger.info(`[Migrations] Rolling back migration: ${migrationId}...`);
    await client.query('BEGIN');

    if (migration) {
      await migration.down(client);
    } else {
      await executeMigrationDown(client, migrationId);
    }

    await client.query('DELETE FROM _migrations WHERE id = $1', [migrationId]);
    await client.query('COMMIT');
    logger.info(`[Migrations] Successfully rolled back: ${migrationId}`);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    logger.error(`[Migrations] Rollback failed: ${migrationId}`, { error: err });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Roll back the most recently applied migration recorded in _migrations.
 * Returns the rolled back migration ID or null if no applied migrations exist.
 */
export async function rollbackLastMigration(
  migrations?: RollbackTargetMigration[]
): Promise<string | null> {
  const pool = getDbClient();

  const result = await pool.query<{ id: string }>(
    'SELECT id FROM _migrations ORDER BY applied_at DESC, id DESC LIMIT 1'
  );

  if (!result.rows || result.rows.length === 0) {
    logger.info('[Migrations] No applied migrations to roll back');
    return null;
  }

  const lastId = result.rows[0].id;
  await rollbackMigration(lastId, migrations);
  return lastId;
}
