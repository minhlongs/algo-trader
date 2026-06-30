/**
 * Shared DB — barrel export
 * Database primitives: client, queries, transactions, migrations.
 * Zero business logic — no tenant awareness, no PnL, no billing.
 */

export {
  getDbClient,
  query,
  transaction,
  closeDbConnection,
  type DbConfig,
  type DbRow,
} from './postgres-client';

export { runMigrations } from './migration-runner';
