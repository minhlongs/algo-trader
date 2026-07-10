/**
 * Migration 036: Create Strategy Versions Table
 *
 * Immutable versioned snapshots of marketplace strategies.
 * Supports semver-like versioning (major.minor.patch).
 * Published snapshots are immutable — updates create new versions.
 */

import { PoolClient } from 'pg';

export const id = '036-strategy-versions';
export const description =
  'Create strategy_versions table for immutable versioned strategy snapshots';

export async function up(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS strategy_versions (
      id VARCHAR(64) PRIMARY KEY,
      strategy_id VARCHAR(64) NOT NULL REFERENCES marketplace_strategies(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL,
      version VARCHAR(32) NOT NULL,
      semver_major INTEGER NOT NULL,
      semver_minor INTEGER NOT NULL,
      semver_patch INTEGER NOT NULL,
      entry_rules JSONB NOT NULL,
      exit_rules JSONB NOT NULL,
      risk_params JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      backtest_run_id VARCHAR(64) REFERENCES marketplace_backtests(id) ON DELETE SET NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(strategy_id, semver_major, semver_minor, semver_patch)
    )
  `);

  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_strategy_versions_strategy_id ON strategy_versions(strategy_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_strategy_versions_tenant_id ON strategy_versions(tenant_id)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_strategy_versions_status ON strategy_versions(status)`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_strategy_versions_version ON strategy_versions(strategy_id, semver_major, semver_minor, semver_patch)`,
  );
}

export async function down(client: PoolClient): Promise<void> {
  await client.query('DROP TABLE IF EXISTS strategy_versions CASCADE');
}
