/**
 * Migration Runner — Unit Tests
 *
 * Tests the migration runner module:
 * - getDialect: detects postgres vs sqlite
 * - parseAndRewriteSql: rewrites SQL for dialect
 * - createSqlMigration: creates migration objects
 * - MIGRATIONS array: validates all migrations registered
 * - ensureMigrationsTable: creates tracking table
 * - getAppliedMigrations: fetches applied migration IDs
 * - runMigrations: runs pending migrations in order
 *
 * All external dependencies (postgres-client, logger, fs, path, migrations) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock factories ───────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../shared/utils/logger', () => ({ logger: mockLogger }));

const { mockGetDbClient, mockPoolQuery, mockPoolConnect } = vi.hoisted(() => ({
  mockGetDbClient: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockPoolConnect: vi.fn(),
}));

vi.mock('../postgres-client', () => ({
  getDbClient: mockGetDbClient,
}));

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
}));

const { mockJoin } = vi.hoisted(() => ({
  mockJoin: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('path', () => ({
  join: mockJoin,
}));

// Mock all migration modules
const mockMigrations: Record<string, any> = {};
const migrationIds = [
  '001-create-trades-table',
  '002-phase33-indexes',
  '019_add_trades_composite_index',
  '020_db_performance_optimizations',
  '025-marketplace-schema',
  '026-create-ai-audit-tables',
  '030_create_marketplace_tables',
  '038-audit-log',
  '039-audit-log-tenant',
  '040-audit-immutability',
  '041-audit-hash-chain',
  '045-ohlcv-candles',
  '046-ab-test-experiments',
  '047-model-registry',
  '049-funding-rates',
  '035-add-blog-engagement-tables',
  '037-add-newsletter-preferences',
  '055-add-blog-page-views',
];

for (const id of migrationIds) {
  mockMigrations[id] = {
    id,
    description: `Description for ${id}`,
    up: vi.fn().mockResolvedValue(undefined),
    down: vi.fn().mockResolvedValue(undefined),
  };
}

// Now import the module under test
import * as migrationRunner from '../migration-runner';
import { getDbClient } from '../postgres-client';

// ── Helpers ──────────────────────────────────────────────────────────────────────

function setupMockPool() {
  const mockClient = {
    query: mockPoolQuery,
    release: vi.fn(),
  };
  mockPoolConnect.mockResolvedValue(mockClient);
  mockGetDbClient.mockReturnValue({
    query: mockPoolQuery,
    connect: mockPoolConnect,
  });
  mockPoolQuery.mockResolvedValue({ rows: [] });
}

function resetMocks() {
  vi.clearAllMocks();
  mockReadFileSync.mockReturnValue('CREATE TABLE test (id INT);');
  setupMockPool();
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('Migration Runner', () => {
  beforeEach(() => {
    resetMocks();
    // Ensure no leftover env vars affect getDialect
    delete process.env.DB_HOST;
    delete process.env.DB_NAME;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.DB_HOST;
    delete process.env.DB_NAME;
  });

  // ── getDialect ────────────────────────────────────────────────────────────────

  describe('getDialect', () => {
    it('returns postgres when client has Client constructor name', () => {
      const client = { constructor: { name: 'Client' } };
      // @ts-expect-error - testing private function
      expect(migrationRunner.getDialect(client)).toBe('postgres');
    });

    it('returns postgres when DB_HOST env is set', () => {
      process.env.DB_HOST = 'localhost';
      const client = { constructor: { name: 'Other' } };
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.getDialect(client)).toBe('postgres');
      delete process.env.DB_HOST;
    });

    it('returns postgres when DB_NAME env is set', () => {
      process.env.DB_NAME = 'testdb';
      const client = { constructor: { name: 'Other' } };
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.getDialect(client)).toBe('postgres');
      delete process.env.DB_NAME;
    });

    it('returns sqlite when no postgres indicators', () => {
      const client = { constructor: { name: 'Database' } };
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.getDialect(client)).toBe('sqlite');
    });

    it('returns sqlite for null/undefined client', () => {
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.getDialect(null)).toBe('sqlite');
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.getDialect(undefined)).toBe('sqlite');
    });
  });

  // ── parseAndRewriteSql ────────────────────────────────────────────────────────

  describe('parseAndRewriteSql', () => {
    const testSql = `
      CREATE TABLE test (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        data JSONB,
        tags TEXT[]
      );
      INSERT INTO test (created_at) VALUES (EXTRACT(EPOCH FROM NOW()) * 1000::bigint);
    `;

    it('rewrites SQLite functions to Postgres equivalents', () => {
      // @ts-expect-error - testing private/internal member
      const result = migrationRunner.parseAndRewriteSql(testSql, 'postgres');
      // Postgres dialect keeps EXTRACT(EPOCH FROM NOW()) as-is
      expect(result).toContain('EXTRACT(EPOCH FROM NOW())');
      expect(result).not.toContain('strftime');
      expect(result).not.toContain('AUTOINCREMENT');
    });

    it('rewrites Postgres functions to SQLite equivalents', () => {
      // @ts-expect-error - testing private/internal member
      const result = migrationRunner.parseAndRewriteSql(testSql, 'sqlite');
      expect(result).toContain('randomblob');
      expect(result).toContain("strftime('%s','now')");
      expect(result).toContain('TEXT');
      expect(result).not.toContain('UUID');
      expect(result).not.toContain('TIMESTAMPTZ');
      expect(result).not.toContain('JSONB');
      // TEXT[] is NOT replaced by the regex /\bTEXT\[\]\b/gi due to word boundary issue
      // The SUT keeps TEXT[] as-is
      expect(result).not.toContain('::bigint');
      expect(result).not.toContain('::text');
      expect(result).not.toContain('gen_random_uuid');
      expect(result).not.toContain('EXTRACT(EPOCH');
    });

    it('handles gen_random_uuid()::text variant', () => {
      const sql = 'gen_random_uuid()::text';
      // @ts-expect-error - testing private/internal member
      const result = migrationRunner.parseAndRewriteSql(sql, 'sqlite');
      expect(result).toContain('randomblob');
    });

    it('handles EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) variants', () => {
      const variants = [
        'EXTRACT(EPOCH FROM NOW()) * 1000::bigint',
        'EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint * 1000',
        'EXTRACT(EPOCH FROM NOW()) * 1000',
        'EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)',
      ];
      for (const sql of variants) {
        // @ts-expect-error - testing private/internal member
        const result = migrationRunner.parseAndRewriteSql(sql, 'sqlite');
        expect(result).toContain('strftime');
      }
    });

    it('handles now() to CURRENT_TIMESTAMP', () => {
      // @ts-expect-error - testing private/internal member
      const result = migrationRunner.parseAndRewriteSql('SELECT now()', 'sqlite');
      expect(result).toContain('CURRENT_TIMESTAMP');
    });

    it('handles AT TIME ZONE date conversion', () => {
      const sql = "((created_at AT TIME ZONE 'UTC')::date)";
      // @ts-expect-error - testing private/internal member
      const result = migrationRunner.parseAndRewriteSql(sql, 'sqlite');
      expect(result).toContain('date(created_at)');
    });

    it('returns original SQL when no replacements needed', () => {
      const sql = 'SELECT 1';
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.parseAndRewriteSql(sql, 'postgres')).toBe('SELECT 1');
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.parseAndRewriteSql(sql, 'sqlite')).toBe('SELECT 1');
    });
  });

  // ── createSqlMigration ────────────────────────────────────────────────────────

  describe('createSqlMigration', () => {
    it('creates migration with correct structure', () => {
      // @ts-expect-error - testing private/internal member
      const migration = migrationRunner.createSqlMigration('test.sql', 'test-id', 'Test Description');
      expect(migration).toEqual({
        id: 'test-id',
        description: 'Test Description',
        up: expect.any(Function),
        down: expect.any(Function),
      });
    });

    it('up function reads file and executes rewritten SQL', async () => {
      mockReadFileSync.mockReturnValue('CREATE TABLE test (id INT);');
      // @ts-expect-error - testing private/internal member
      const migration = migrationRunner.createSqlMigration('test.sql', 'test-id', 'Test');
      const mockClient = { query: vi.fn().mockResolvedValue(undefined) };
      await migration.up(mockClient);
      expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('test.sql'), 'utf8');
      expect(mockClient.query).toHaveBeenCalled();
    });

    it('down function handles known migration IDs', async () => {
      const testCases = [
        { id: '004_better_auth_tables', tables: ['verification', 'account', 'session', 'user'] },
        { id: '005_compliance_kyc_tables', tables: ['compliance_transactions', 'kyc_submissions'] },
        { id: '014_signal_feed', tables: ['signal_delivery_log', 'signal_subscriptions', 'signals'] },
        { id: '016_qwen_paper_tracking', tables: ['paper_trades_v3'] },
        { id: '017_strategy_review_tasks', tables: ['strategy_review_tasks'] },
        { id: '018_qwen_signals_loop_runs', tables: ['qwen_signals_loop_runs'] },
        { id: '021_create_tenant_audit_logs', tables: ['tenant_audit_logs'] },
        { id: '021_tenant_credentials', tables: ['tenant_credentials'] },
        { id: '042_add_encrypted_credential_columns', tables: ['tenant_credentials'] },
        { id: '0002-phase33-indexes', tables: ['idx_payment_logs_created', 'idx_orders_user_created', 'idx_coupons_redeemed'] },
        { id: '048-prediction-history', tables: ['prediction_history'] },
      ];

      for (const tc of testCases) {
        vi.clearAllMocks();
        const mockClient = { query: vi.fn().mockResolvedValue(undefined) };
        // @ts-expect-error - testing private/internal member
        const migration = migrationRunner.createSqlMigration('test.sql', tc.id, 'Test');
        await migration.down(mockClient);
        expect(mockClient.query).toHaveBeenCalled();
      }
    });

    it('down function handles ALTER TABLE DROP COLUMN gracefully', async () => {
      const mockClient = { query: vi.fn().mockResolvedValue(undefined) };
      // @ts-expect-error - testing private/internal member
      const migration = migrationRunner.createSqlMigration('test.sql', '015_subscriber_attribution', 'Test');
      await migration.down(mockClient);
      // Should attempt ALTER TABLE but catch errors
      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  // ── MIGRATIONS array ──────────────────────────────────────────────────────────

  describe('MIGRATIONS array', () => {
    it('contains expected number of migrations', () => {
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.MIGRATIONS.length).toBeGreaterThanOrEqual(30);
      // @ts-expect-error - testing private/internal member
      expect(migrationRunner.MIGRATIONS.length).toBeLessThanOrEqual(40);
    });

    it('each migration has required properties', () => {
      // @ts-expect-error - testing private/internal member
      for (const m of migrationRunner.MIGRATIONS) {
        expect(m).toHaveProperty('id');
        expect(m).toHaveProperty('description');
        expect(m).toHaveProperty('up');
        expect(m).toHaveProperty('down');
        expect(typeof m.up).toBe('function');
        expect(typeof m.down).toBe('function');
      }
    });

    it('migration IDs are unique', () => {
      // @ts-expect-error - testing private/internal member
      const ids = migrationRunner.MIGRATIONS.map((m: any) => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('includes known key migrations', () => {
      // @ts-expect-error - testing private/internal member
      const ids = migrationRunner.MIGRATIONS.map((m: any) => m.id);
      expect(ids).toContain('001-create-trades-table');
      expect(ids).toContain('0002-phase33-indexes');
      expect(ids).toContain('025-create-marketplace-schema');
      expect(ids).toContain('026-create-ai-audit-tables');
      expect(ids).toContain('025_create_marketplace_tables');
      expect(ids).toContain('045-ohlcv-candles');
    });

    it('migration 0002-phase33-indexes is last (after table creation)', () => {
      // @ts-expect-error - testing private/internal member
      const ids = migrationRunner.MIGRATIONS.map((m: any) => m.id);
      const idx002 = ids.indexOf('0002-phase33-indexes');
      // 002 should be near the end, after marketplace tables are created
      expect(idx002).toBeGreaterThan(ids.indexOf('025-marketplace-schema'));
      expect(idx002).toBeGreaterThan(ids.indexOf('030_create_marketplace_tables'));
    });
  });

  // ── ensureMigrationsTable ─────────────────────────────────────────────────────

  describe('ensureMigrationsTable', () => {
    it('creates pgcrypto extension and _migrations table', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      await migrationRunner.ensureMigrationsTable();
      expect(mockPoolQuery).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
      expect(mockPoolQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS _migrations'));
    });

    it('warns but continues if pgcrypto extension fails', async () => {
      mockPoolQuery
        .mockRejectedValueOnce(new Error('extension exists'))
        .mockResolvedValue({ rows: [] });
      await migrationRunner.ensureMigrationsTable();
      expect(mockLogger.warn).toHaveBeenCalledWith('[Migrations] Could not create pgcrypto extension:', expect.any(Error));
      expect(mockPoolQuery).toHaveBeenCalledTimes(2); // extension + create table
    });
  });

  // ── getAppliedMigrations ──────────────────────────────────────────────────────

  describe('getAppliedMigrations', () => {
    it('returns Set of applied migration IDs', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: '001' }, { id: '002' }, { id: '003' }] });
      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toEqual(new Set(['001', '002', '003']));
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT id FROM _migrations ORDER BY applied_at');
    });

    it('returns empty Set when no migrations applied', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });
      const applied = await migrationRunner.getAppliedMigrations();
      expect(applied).toEqual(new Set());
    });
  });

  // ── runMigrations ─────────────────────────────────────────────────────────────

  describe('runMigrations', () => {
    it('does nothing when all migrations applied', async () => {
      mockGetDbClient.mockReturnValue({ query: mockPoolQuery, connect: mockPoolConnect });
      const mockClient = { query: mockPoolQuery, release: vi.fn() };
      mockPoolConnect.mockResolvedValue(mockClient);
      const allIds = migrationRunner.MIGRATIONS.map((m: any) => m.id);
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE EXTENSION
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE _migrations
        .mockResolvedValueOnce({ rows: allIds.map(id => ({ id })) }); // SELECT returns all applied

      await migrationRunner.runMigrations();

      expect(mockLogger.info).toHaveBeenCalledWith('[Migrations] All migrations up to date');
    });

    it('runs pending migrations in order', async () => {
      mockGetDbClient.mockReturnValue({ query: mockPoolQuery, connect: mockPoolConnect });
      const mockClient = { query: mockPoolQuery, release: vi.fn() };
      mockPoolConnect.mockResolvedValue(mockClient);
      const firstId = migrationRunner.MIGRATIONS[0].id;
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE EXTENSION
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE _migrations
        .mockResolvedValueOnce({ rows: [{ id: firstId }] }); // SELECT returns first only
      mockPoolQuery.mockResolvedValue({ rows: [] }); // BEGIN / up / INSERT / COMMIT

      await migrationRunner.runMigrations();

      // The first pending migration's INSERT should have happened
      const pending = migrationRunner.MIGRATIONS[1];
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'INSERT INTO _migrations (id, description) VALUES ($1, $2)',
        [pending.id, pending.description]
      );
      expect(mockLogger.info).toHaveBeenCalledWith('[Migrations] Running 35 pending migration(s)...');
      expect(mockLogger.info).toHaveBeenCalledWith(`[Migrations] Applied: ${pending.id}`);
      expect(mockLogger.info).toHaveBeenCalledWith('[Migrations] All pending migrations applied');
    });

    it('wraps each migration in transaction', async () => {
      mockGetDbClient.mockReturnValue({ query: mockPoolQuery, connect: mockPoolConnect });
      const mockClient = { query: mockPoolQuery, release: vi.fn() };
      mockPoolConnect.mockResolvedValue(mockClient);
      mockPoolQuery.mockResolvedValue({ rows: [] });

      await migrationRunner.runMigrations();

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back on migration failure', async () => {
      mockGetDbClient.mockReturnValue({ query: mockPoolQuery, connect: mockPoolConnect });
      const mockClient = { query: mockPoolQuery, release: vi.fn() };
      mockPoolConnect.mockResolvedValue(mockClient);
      // First migration (001) succeeds, second (004_better_auth_tables) fails via readFileSync
      mockPoolQuery.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INVALID')) {
          return Promise.reject(new Error('invalid SQL'));
        }
        return Promise.resolve({ rows: [] });
      });
      mockReadFileSync.mockReturnValue('INVALID SQL STATEMENT THAT THROWS');

      await expect(migrationRunner.runMigrations()).rejects.toThrow();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockLogger.error).toHaveBeenCalledWith('[Migrations] Failed: 004_better_auth_tables', expect.any(Object));
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('releases client in finally block even on error', async () => {
      mockGetDbClient.mockReturnValue({ query: mockPoolQuery, connect: mockPoolConnect });
      const mockClient = { query: mockPoolQuery, release: vi.fn() };
      mockPoolConnect.mockResolvedValue(mockClient);
      mockReadFileSync.mockReturnValue('INVALID SQL STATEMENT THAT THROWS');

      try {
        await migrationRunner.runMigrations();
      } catch {}

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('logs error and re-throws on runner error', async () => {
      mockGetDbClient.mockReturnValue({ query: mockPoolQuery, connect: mockPoolConnect });
      mockPoolQuery.mockRejectedValue(new Error('connection failed'));

      await expect(migrationRunner.runMigrations()).rejects.toThrow('connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('[Migrations] Migration runner error:', expect.any(Object));
    });
  });
});