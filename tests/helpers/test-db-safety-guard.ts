/**
 * Test Database Safety Guard
 * Prevents accidental connection to or mutation of production/staging databases.
 *
 * Requirements:
 * - Database name must strictly end with '_test' or equal 'algo_trader_test_auth'.
 * - Must reject any database named 'algo_trader' or any unverified production host.
 * - Cleanup helpers MUST strictly delete by exact primary keys (IDs / runId) created
 *   by the current test run, never via broad wildcard patterns.
 */

import type { PoolConfig } from 'pg';

export const ALLOWED_TEST_DB_NAMES = [
  'algo_trader_test_auth',
  'algo_trader_test',
];

export function assertTestDatabaseSafe(config: PoolConfig): void {
  const dbName = config.database;
  if (!dbName || typeof dbName !== 'string') {
    throw new Error('[TestDbSafetyGuard] FATAL: Database name must be explicitly configured for tests.');
  }

  const normalized = dbName.trim().toLowerCase();

  // Strict check: must be in allowlist or end with safe test suffixes
  const isAllowed =
    ALLOWED_TEST_DB_NAMES.includes(normalized) ||
    normalized.endsWith('_test') ||
    normalized.endsWith('_test_auth');

  if (!isAllowed || normalized === 'algo_trader' || normalized === 'algo_trader_production') {
    throw new Error(
      `[TestDbSafetyGuard] REJECTED UNSAFE DATABASE: "${dbName}". Tests must run strictly against isolated test databases.`,
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
