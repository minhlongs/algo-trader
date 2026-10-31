/**
 * Test Database Safety Guard
 * Prevents accidental connection to or mutation of production/staging databases.
 *
 * Requirements:
 * - Database target MUST match an exact allowlist entry.
 * - Host MUST match an exact allowlist entry — no wildcard (e.g. `*.local`) fallback.
 * - A `_test`/`_test_auth` suffix alone is NEVER sufficient; it proves nothing about the target.
 * - Must reject any production hosts or database named 'algo_trader'.
 * - Verifies configuration host/database before connection AND checks runtime
 *   `SELECT current_database()` before any mutation or migration.
 * - Cleanup helpers MUST strictly delete by exact primary keys (IDs / runId) created
 *   by the current test run, never via broad wildcard patterns or truncation.
 */

import type { PoolConfig } from 'pg';

/**
 * Exact allowlist of test database names. A name must be listed here to be a
 * valid target; a `_test`/`_test_auth` suffix is never accepted on its own.
 * MUST NOT contain any name with "prod" or "live" in it.
 */
export const ALLOWED_TEST_DB_NAMES = [
  'algo_trader_test_auth',
  'algo_trader_test',
];

export const ALLOWED_TEST_HOSTS = [
  'localhost',
  '127.0.0.1',
  'postgres', // CI docker service name
  '::1',
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

  // Host must be an explicitly approved local/CI isolated test target.
  // No wildcard suffix matching: an unknown host is simply not on the list.
  const host = (config.host || 'localhost').trim().toLowerCase();
  if (!ALLOWED_TEST_HOSTS.includes(host)) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE HOST: "${config.host}". Tests must only connect to approved local/CI isolated test services.`,
    );
  }

  // Defense-in-depth: reject names containing "prod" or "live" even if someone
  // passes a `_test` suffix or attempts to add a dangerous target.
  if (normalizedDb.includes('prod') || normalizedDb.includes('live')) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE TARGET: "${dbName}". Target containing "prod" or "live" is forbidden even with test suffix.`,
    );
  }

  // Only databases named exactly in the allowlist are usable targets.
  if (!ALLOWED_TEST_DB_NAMES.includes(normalizedDb)) {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE DATABASE: "${dbName}". Database name is not an approved test database target.`,
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
