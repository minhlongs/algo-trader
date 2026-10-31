/**
 * Unit Tests for Test Database Safety Guard
 * Proves that unsafe or production database configurations are rejected
 * immediately (fail-closed) before any schema migration or data mutation occurs.
 */

import { describe, it, expect } from 'vitest';
import {
  assertTestDatabaseSafe,
  createScopedCleanupTracker,
} from '../../../helpers/test-db-safety-guard';

describe('Test Database Safety Guard (Fail-Closed)', () => {
  it('rejects production database name "algo_trader"', () => {
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'algo_trader',
      }),
    ).toThrow(/REJECTED UNSAFE DATABASE/);
  });

  it('rejects empty or missing database name', () => {
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: '',
      }),
    ).toThrow(/Database name must be explicitly configured/);

    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
      }),
    ).toThrow(/Database name must be explicitly configured/);
  });

  it('rejects arbitrary non-test database names', () => {
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'cashclaw_staging',
      }),
    ).toThrow(/REJECTED UNSAFE DATABASE/);
  });

  it('rejects forbidden targets even if they end with _test suffix (defense-in-depth)', () => {
    // Proves that _test suffix ALONE is never trusted; a name containing prod or
    // live is rejected outright, before any allowlist lookup or connection.
    for (const dbName of ['production_test', 'live_trader_test']) {
      expect(() =>
        assertTestDatabaseSafe({
          host: 'localhost',
          port: 5432,
          database: dbName,
        }),
      ).toThrow(/\[TestDbSafetyGuard\] REJECTED/);
    }
  });

  it('rejects non-test host/remote target before any connection', () => {
    expect(() =>
      assertTestDatabaseSafe({
        host: 'db.cashclaw.internal',
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).toThrow(/REJECTED UNSAFE HOST/);

    expect(() =>
      assertTestDatabaseSafe({
        host: '10.0.0.5',
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).toThrow(/REJECTED UNSAFE HOST/);
  });

  it('rejects prod/live names via the defense-in-depth layer, not only via allowlist omission', () => {
    // Proves the innermost layer runs independently: names that WOULD pass the
    // prod/live scan are unlike the allowlist entries, so this test exercises the
    // specific rejection. A name that contains "prod"/"live" must be rejected even
    // if it were ever added to ALLOWED_TEST_DB_NAMES.
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'algo_trader_test_live',
      }),
    ).toThrow(/REJECTED UNSAFE (TARGET|DATABASE)/);

    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'algo_trader_prod',
      }),
    ).toThrow(/REJECTED UNSAFE (TARGET|DATABASE)/);
  });

  it('rejects wildcard-style .local hosts and unapproved _test suffixes (exact allowlist only)', () => {
    // Wildcard `*.local` host matching is not an approved test target.
    expect(() =>
      assertTestDatabaseSafe({
        host: 'macbook.local',
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).toThrow(/REJECTED UNSAFE HOST/);

    expect(() =>
      assertTestDatabaseSafe({
        host: 'db.local',
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).toThrow(/REJECTED UNSAFE HOST/);

    // An arbitrary `_test` suffix is no longer sufficient on its own.
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'cashclaw_test',
      }),
    ).toThrow(/not an approved test database target/);

    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'algo_trader_test_auth_archive',
      }),
    ).toThrow(/REJECTED UNSAFE DATABASE/);
  });

  it('accepts approved isolated test database targets on approved hosts', () => {
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).not.toThrow();

    expect(() =>
      assertTestDatabaseSafe({
        host: '127.0.0.1',
        port: 5432,
        database: 'algo_trader_test',
      }),
    ).not.toThrow();

    expect(() =>
      assertTestDatabaseSafe({
        host: 'postgres', // CI service
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).not.toThrow();
  });

  it('tracks scoped user, session, and verification IDs accurately for targeted cleanup', () => {
    const tracker = createScopedCleanupTracker();
    tracker.trackUserId('user-101');
    tracker.trackUserId('user-102');
    tracker.trackUserId('user-101'); // duplicate deduplicated
    tracker.trackSessionId('sess-501');
    tracker.trackVerificationIdentifier('auth-state:xyz123');
    tracker.trackVerificationIdentifier('auth-state:xyz123'); // duplicate deduplicated

    expect(tracker.getUserIds()).toEqual(['user-101', 'user-102']);
    expect(tracker.getSessionIds()).toEqual(['sess-501']);
    expect(tracker.getVerificationIdentifiers()).toEqual(['auth-state:xyz123']);

    tracker.clear();
    expect(tracker.getUserIds()).toEqual([]);
    expect(tracker.getVerificationIdentifiers()).toEqual([]);
  });
});
