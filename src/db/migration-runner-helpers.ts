/**
 * Migration Runner Helpers
 * SQL file loading, dialect rewriting, _migrations table history tracking,
 * and transactional batch execution helpers.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { PoolClient } from 'pg';
import { logger } from '../shared/utils/logger';
import { getDbClient } from './postgres-client';
import { getDialect, parseAndRewriteSql } from './migration-sql-dialect';
import { executeMigrationDown } from './migration-down-handlers';

export interface Migration {
  id: string;
  description: string;
  up: (client: PoolClient) => Promise<void>;
  down: (client: PoolClient) => Promise<void>;
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
      await client.query(rewrittenSql);
    },
    down: async (client) => {
      await executeMigrationDown(client, id);
    },
  };
}

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
 * Execute a list of pending migrations sequentially inside individual transactions
 */
export async function applyPendingMigrations(pending: readonly Migration[]): Promise<void> {
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
}
