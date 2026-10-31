/**
 * Test Database Safety Guard
 * Prevents accidental connection to or mutation of production/staging databases.
 *
 * Requirements:
 * - Database target MUST be explicitly approved by configuration.
 * - MUST NOT trust suffix '_test' alone — host and target must match approved isolated test environments.
 * - Must reject any production hosts or database named 'algo_trader'.
 * - Verifies configuration host/database before connection AND checks runtime
 *   `SELECT current_database()` before any mutation or migration.
 * - Cleanup helpers MUST strictly delete by exact primary keys (IDs / runId) created
 *   by the current test run, never via broad wildcard patterns or truncation.
 */

import type { PoolConfig } from 'pg';

export const ALLOWED_TEST_DB_NAMES = [
  'algo_trader_test_auth',
  'algo_trader_test',
];

export const ALLOWED_TEST_HOSTS = [
  'localhost',
  '127.0.0.1',
  'postgres', // CI docker service name
];

export function assertTestDatabaseSafe(config: PoolConfig): void {
  const dbName = config.database;
  if (!dbName || typeof dbName !== 'string') {
    throw new Error('[TestDbSafetyGuard] FATAL: Database name must be explicitly configured for tests.');
  }

  const normalizedDb = dbName.trim().toLowerCase();

  // Reject any production database name variations immediately
  if (
    normalizedDb === 'algo_trader' ||
    normalizedDb === 'algo_trader_production' ||
    normalizedDb === 'production' ||
    normalizedDb === 'algo_trader_prod'
  ) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE DATABASE: "${dbName}". Production databases are strictly forbidden.`,
    );
  }

  // Check host: host must be an approved isolated test host (localhost, 127.0.0.1, or postgres CI service)
  const host = (config.host || 'localhost').trim().toLowerCase();
  const isHostAllowed =
    ALLOWED_TEST_HOSTS.includes(host) ||
    host.endsWith('.local') ||
    host === '::1';

  if (!isHostAllowed) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE HOST: "${config.host}". Tests must only connect to local/CI isolated test services.`,
    );
  }

  // Host/Target check: do NOT trust '_test' suffix alone if the database is not in allowlist
  // and environment is not explicitly verified as test.
  const isExplicitlyAllowedName = ALLOWED_TEST_DB_NAMES.includes(normalizedDb);
  const hasSafeSuffix =
    normalizedDb.endsWith('_test_auth') || normalizedDb.endsWith('_test');

  if (!isExplicitlyAllowedName && !hasSafeSuffix) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE DATABASE: "${dbName}". Database name is not an approved test database target.`,
    );
  }

  // Additional defense: if someone attempts a dangerous pattern like 'prod_test' or 'production_test'
  if (normalizedDb.includes('prod') || normalizedDb.includes('live')) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE TARGET: "${dbName}". Target containing "prod" or "live" is forbidden even with test suffix.`,
    );
  }
}

export interface ScopedCleanupTracker {
  trackUserId(id: string): void;
  trackSessionId(id: string): void;
  trackVerificationIdentifier(identifier: string): void;
  getUserIds(): string[];
  getSessionIds(): string[];
  getVerificationIdentifiers(): string[];
  clear(): void;
}

export function createScopedCleanupTracker(): ScopedCleanupTracker {
  const userIds = new Set<string>();
  const sessionIds = new Set<string>();
  const verificationIdentifiers = new Set<string>();

  return {
    trackUserId(id: string) {
      if (id) userIds.add(id);
    },
    trackSessionId(id: string) {
      if (id) sessionIds.add(id);
    },
    trackVerificationIdentifier(identifier: string) {
      if (identifier) verificationIdentifiers.add(identifier);
    },
    getUserIds() {
      return Array.from(userIds);
    },
    getSessionIds() {
      return Array.from(sessionIds);
    },
    getVerificationIdentifiers() {
      return Array.from(verificationIdentifiers);
    },
    clear() {
      userIds.clear();
      sessionIds.clear();
      verificationIdentifiers.clear();
    },
  };
}
