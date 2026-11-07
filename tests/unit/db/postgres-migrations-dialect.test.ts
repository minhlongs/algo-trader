/**
 * Unit tests for PostgreSQL 15.17 migration dialect fixes:
 * - 041-audit-hash-chain.ts (unambiguous CTE column qualification)
 * - 056-add-kyc-verifications.ts (gen_random_uuid()::text on Postgres vs randomblob on SQLite)
 * - 002-phase33-indexes.ts (Postgres table/column names vs SQLite legacy names)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PoolClient } from 'pg';
import * as migration041 from '../../../src/db/migrations/041-audit-hash-chain';
import * as migration056 from '../../../src/shared/db/migrations/056-add-kyc-verifications';
import * as migration002 from '../../../src/db/migrations/002-phase33-indexes';

function createMockClient(asPostgres: boolean): { client: PoolClient; queries: string[] } {
  const queries: string[] = [];
  class PgPoolClientMock {
    async query(sql: string): Promise<{ rows: never[] }> {
      queries.push(sql);
      return { rows: [] };
    }
  }
  const raw = asPostgres
    ? new PgPoolClientMock()
    : {
        async query(sql: string) {
          queries.push(sql);
          return { rows: [] };
        },
      };
  return { client: raw as unknown as PoolClient, queries };
}

describe('PostgreSQL 15.17 Migration Dialect Compatibility', () => {
  beforeEach(() => {
    delete process.env.DB_HOST;
    delete process.env.DB_NAME;
  });

  afterEach(() => {
    delete process.env.DB_HOST;
    delete process.env.DB_NAME;
  });

  it('041-audit-hash-chain qualifies al.id, al.tenant_id, and with_prev_hash columns in payload CTE', async () => {
    const { client, queries } = createMockClient(true);
    await migration041.up(client);
    const backfillSql = queries.find((q) => q.includes('WITH ordered AS')) ?? '';
    expect(backfillSql).toContain('al.id,');
    expect(backfillSql).toContain('al.tenant_id,');
    expect(backfillSql).toContain('with_prev_hash.sequence_number,');
    expect(backfillSql).toContain('with_prev_hash.previous_hash,');
    expect(backfillSql).toContain("COALESCE(al.metadata::text, '{}')");
  });

  it('056-add-kyc-verifications uses gen_random_uuid()::text on Postgres and randomblob(16) on SQLite', async () => {
    const pgMock = createMockClient(true);
    await migration056.up(pgMock.client);
    expect(pgMock.queries[0]).toContain('DEFAULT gen_random_uuid()::text');
    expect(pgMock.queries[0]).not.toContain('randomblob');

    const sqliteMock = createMockClient(false);
    await migration056.up(sqliteMock.client);
    expect(sqliteMock.queries[0]).toContain('DEFAULT (lower(hex(randomblob(16))))');
  });

  it('002-phase33-indexes uses PostgreSQL schema columns on Postgres and legacy columns on SQLite', async () => {
    const pgMock = createMockClient(true);
    await migration002.up(pgMock.client);
    expect(pgMock.queries).toEqual([
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(customer_email, status)',
      'CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payments(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user_created ON trades(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_coupons_redeemed ON coupons(active, created_at)',
    ]);

    const sqliteMock = createMockClient(false);
    await migration002.up(sqliteMock.client);
    expect(sqliteMock.queries).toEqual([
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payment_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_coupons_redeemed ON coupons(redeemed, redeemed_at)',
    ]);
  });
});
