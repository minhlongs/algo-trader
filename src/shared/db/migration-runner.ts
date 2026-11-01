/**
 * Migration Runner — Re-export from canonical database migration runner.
 * Ensures consistent migration sets across all application entry points.
 */

export {
  MIGRATIONS,
  runMigrations,
  rollbackMigration,
  rollbackLastMigration,
  type Migration,
} from '../../db/migration-runner';

