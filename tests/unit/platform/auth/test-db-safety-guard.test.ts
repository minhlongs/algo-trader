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

  it('accepts approved isolated test database names', () => {
    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'algo_trader_test_auth',
      }),
    ).not.toThrow();

    expect(() =>
      assertTestDatabaseSafe({
        host: 'localhost',
        port: 5432,
        database: 'custom_isolated_test',
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
