/**
 * Database Module — re-export bridge
 * Primitives (client, query, tx, migrations) → src/shared/db/
 * Business services (PnL, trades, tenants) → still local (Phase 3 split)
 */

export {
  getDbClient,
  query,
  transaction,
  closeDbConnection,
  type DbConfig,
  type DbRow,
} from '../shared/db/postgres-client';

export { runMigrations } from '../shared/db/migration-runner';

export * from './trade-repository';
export * from './pnl-service';
export * from './tenant-credentials-repository';
