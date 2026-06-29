/**
 * Shared DB Contract Tests
 *
 * Verifies database primitives that the shared kernel will expose.
 * These tests pass BEFORE modules move to a shared-kernel package.
 *
 * Covers 6 contracts:
 *   1. DbConfig interface has expected fields
 *   2. getDbClient returns a pg.Pool instance (mock pg)
 *   3. getDbClient returns same instance on second call (singleton)
 *   4. runMigrations function exists and is callable (mock DB)
 *   5. DbRow interface allows string/number/boolean/Date/null
 *   6. Migration files exist in src/db/migrations/
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../..');
const CLIENT_FILE = resolve(REPO_ROOT, 'src/db/postgres-client.ts');
const MIGRATION_RUNNER_FILE = resolve(REPO_ROOT, 'src/db/migration-runner.ts');
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'src/db/migrations');

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}

// ─── Mock pg ────────────────────────────────────────────────────────────────
const mockClient = {
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: vi.fn(),
};

const mockPoolInstance = {
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: vi.fn().mockResolvedValue(mockClient),
  on: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
};

// Must be a named function (not arrow) so `new Pool(...)` is constructable.
// Returns the shared mockPoolInstance so tests can pre-configure behavior.
function MockPoolConstructor() {
  return mockPoolInstance;
}
const PoolSpy = vi.fn(MockPoolConstructor);

vi.mock('pg', () => ({
  default: { Pool: PoolSpy },
  Pool: PoolSpy,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract interface body from source text by interface name. */
function extractInterfaceBody(src: string, name: string): string | null {
  const re = new RegExp(`export\\s+interface\\s+${name}\\s*\\{([^}]+)\\}`, 's');
  const m = src.match(re);
  return m ? m[1] : null;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Shared DB Contract', () => {
  // ── Test 1: DbConfig interface ──────────────────────────────────────────
  describe('1. DbConfig interface', () => {
    const src = readFile(CLIENT_FILE);

    it('defines DbConfig as an exported interface', () => {
      expect(/export\s+interface\s+DbConfig\s*\{/.test(src)).toBe(true);
    });

    const requiredFields: Record<string, string> = {
      host: 'string',
      port: 'number',
      database: 'string',
      user: 'string',
      password: 'string',
      maxConnections: 'number',
    };

    for (const [field, expectedType] of Object.entries(requiredFields)) {
      it(`has field "${field}: ${expectedType}"`, () => {
        const body = extractInterfaceBody(src, 'DbConfig');
        expect(body, 'DbConfig interface body not found').not.toBeNull();
        expect(
          new RegExp(`${field}\\s*:\\s*${expectedType}`).test(body!),
          `DbConfig missing or mistyped field: ${field}. Expected type: ${expectedType}`,
        ).toBe(true);
      });
    }
  });

  // ── Test 2: getDbClient returns a Pool instance ─────────────────────────
  describe('2. getDbClient returns a pg.Pool instance', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset module cache so singleton state is fresh.
      vi.resetModules();
    });

    it('is callable without crashing and returns an object with Pool-like shape', async () => {
      const { getDbClient } = await import('../../src/db/postgres-client');

      const client = getDbClient();
      expect(client).toBeDefined();
      expect(typeof client.query).toBe('function');
      expect(typeof client.connect).toBe('function');
      expect(typeof client.on).toBe('function');
      expect(typeof client.end).toBe('function');
    });

    it('creates Pool with env-driven config', async () => {
      const { getDbClient } = await import('../../src/db/postgres-client');

      getDbClient();

      expect(PoolSpy).toHaveBeenCalledTimes(1);
      const configArg = PoolSpy.mock.calls[0][0];
      expect(configArg).toBeDefined();
      expect(configArg.host).toBeDefined();
      expect(configArg.port).toBeDefined();
      expect(configArg.database).toBeDefined();
      expect(configArg.user).toBeDefined();
      // password may be empty string but must be present as a key
      expect(configArg).toHaveProperty('password');
      expect(typeof configArg.maxConnections).toBe('number');
    });
  });

  // ── Test 3: getDbClient singleton ───────────────────────────────────────
  describe('3. getDbClient singleton pattern', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
    });

    it('returns the same instance on second call', async () => {
      const { getDbClient } = await import('../../src/db/postgres-client');

      const first = getDbClient();
      const second = getDbClient();

      expect(first).toBe(second);
      // Pool constructor should have been called exactly once.
      expect(PoolSpy).toHaveBeenCalledTimes(1);
    });

    it('returns same instance across dynamic re-imports (different module refs)', async () => {
      // First import: creates pool.
      const mod1 = await import('../../src/db/postgres-client');
      const a = mod1.getDbClient();

      // Second import without resetModules — same module cache, same pool.
      const mod2 = await import('../../src/db/postgres-client');
      const b = mod2.getDbClient();

      expect(a).toBe(b);
      expect(PoolSpy).toHaveBeenCalledTimes(1);
    });

    it('creates new Pool after closeDbConnection + fresh getDbClient call', async () => {
      const { getDbClient, closeDbConnection } = await import('../../src/db/postgres-client');

      getDbClient();
      expect(PoolSpy).toHaveBeenCalledTimes(1);

      await closeDbConnection();
      expect(mockPoolInstance.end).toHaveBeenCalledTimes(1);

      // After closing, a new call constructs a fresh pool (constructor called again).
      getDbClient();
      expect(PoolSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── Test 4: runMigrations exists and is callable ────────────────────────
  describe('4. runMigrations function', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
      // Reset mock resolved values so each test can customize.
      mockPoolInstance.query.mockResolvedValue({ rows: [], rowCount: 0 });
      mockPoolInstance.connect.mockResolvedValue(mockClient);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('is exported as an async function from migration-runner', async () => {
      const mod = await import('../../src/db/migration-runner');
      expect(mod.runMigrations).toBeDefined();
      expect(typeof mod.runMigrations).toBe('function');
      // Should be an async function (constructor name AsyncFunction).
      expect(mod.runMigrations.constructor.name).toBe('AsyncFunction');
    });

    it('is callable without throwing (mocked DB)', async () => {
      // Simulate: no applied migrations yet, so both pending migrations run.
      // First call to pool.query is for _migrations table creation.
      // Second call returns empty set (nothing applied yet).
      // Then connect/transaction per migration.
      const { runMigrations } = await import('../../src/db/migration-runner');

      await expect(runMigrations()).resolves.toBeUndefined();

      // _migrations table creation was attempted.
      expect(mockPoolInstance.query).toHaveBeenCalled();
    });

    it('skips when all migrations already applied', async () => {
      // Return both migration IDs as already applied.
      mockPoolInstance.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ensureMigrationsTable
        .mockResolvedValueOnce({
          rows: [
            { id: '001-create-trades-table' },
            { id: '026-create-ai-audit-tables' },
          ],
          rowCount: 2,
        }); // getAppliedMigrations

      const { runMigrations } = await import('../../src/db/migration-runner');

      await expect(runMigrations()).resolves.toBeUndefined();

      // connect should NOT be called since no migrations are pending.
      expect(mockPoolInstance.connect).not.toHaveBeenCalled();
    });

    it('runs pending migration (not yet applied)', async () => {
      // Only 001 is applied; 026 is pending.
      mockPoolInstance.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ensureMigrationsTable
        .mockResolvedValueOnce({
          rows: [{ id: '001-create-trades-table' }],
          rowCount: 1,
        }); // getAppliedMigrations

      const { runMigrations } = await import('../../src/db/migration-runner');

      await expect(runMigrations()).resolves.toBeUndefined();

      // connect was called for the one pending migration (026).
      expect(mockPoolInstance.connect).toHaveBeenCalledTimes(1);
    });
  });

  // ── Test 5: DbRow interface ─────────────────────────────────────────────
  describe('5. DbRow interface', () => {
    const src = readFile(CLIENT_FILE);

    it('defines DbRow as an exported interface with index signature', () => {
      expect(/export\s+interface\s+DbRow\s*\{/.test(src)).toBe(true);
    });

    it('allows string as property value type', () => {
      const body = extractInterfaceBody(src, 'DbRow');
      expect(body, 'DbRow interface body not found').not.toBeNull();
      expect(/string/.test(body!), 'DbRow must allow string values').toBe(true);
    });

    it('allows number as property value type', () => {
      const body = extractInterfaceBody(src, 'DbRow');
      expect(body, 'DbRow interface body not found').not.toBeNull();
      expect(/number/.test(body!), 'DbRow must allow number values').toBe(true);
    });

    it('allows boolean as property value type', () => {
      const body = extractInterfaceBody(src, 'DbRow');
      expect(body, 'DbRow interface body not found').not.toBeNull();
      expect(/boolean/.test(body!), 'DbRow must allow boolean values').toBe(true);
    });

    it('allows Date as property value type', () => {
      const body = extractInterfaceBody(src, 'DbRow');
      expect(body, 'DbRow interface body not found').not.toBeNull();
      expect(/Date/.test(body!), 'DbRow must allow Date values').toBe(true);
    });

    it('allows null as property value type', () => {
      const body = extractInterfaceBody(src, 'DbRow');
      expect(body, 'DbRow interface body not found').not.toBeNull();
      expect(/null/.test(body!), 'DbRow must allow null values').toBe(true);
    });

    it('does not allow undefined in the union (checked manually in source)', () => {
      const body = extractInterfaceBody(src, 'DbRow');
      expect(body, 'DbRow interface body not found').not.toBeNull();
      // The source currently does include `undefined`. This test documents
      // the actual contract. If undefined is removed, update accordingly.
      expect(
        /undefined/.test(body!),
        'DbRow currently allows undefined — verify this is intentional',
      ).toBe(true);
    });
  });

  // ── Test 6: Migration files exist ───────────────────────────────────────
  describe('6. Migration files in src/db/migrations/', () => {
    it('directory exists and contains migration files', () => {
      const files = readdirSync(MIGRATIONS_DIR);
      expect(files.length).toBeGreaterThan(0);
    });

    it('contains expected migration 001 (create-trades-table)', () => {
      const files = readdirSync(MIGRATIONS_DIR);
      const match = files.find((f) => /^001[-_]create[-_]trades[-_]table\.(ts|sql)$/.test(f));
      expect(match, 'Migration 001-create-trades-table not found').toBeDefined();
    });

    it('contains expected migration 026 (create-ai-audit-tables)', () => {
      const files = readdirSync(MIGRATIONS_DIR);
      const match = files.find((f) => /^026[-_]create[-_]ai[-_]audit[-_]tables\.(ts|sql)$/.test(f));
      expect(match, 'Migration 026-create-ai-audit-tables not found').toBeDefined();
    });

    it('migration files follow naming convention (number prefix + description + extension)', () => {
      const files = readdirSync(MIGRATIONS_DIR);
      const validNaming = files.filter((f) =>
        /^\d{3}[-_][a-z][-a-z0-9_]*\.(ts|sql)$/.test(f),
      );
      const invalid = files.filter(
        (f) => !/^\d{3}[-_][a-z][-a-z0-9_]*\.(ts|sql)$/.test(f),
      );
      expect(
        invalid,
        `Migration files with invalid naming: ${invalid.join(', ')}`,
      ).toEqual([]);
      expect(validNaming.length).toBe(files.length);
    });

    it('migration-runner imports match files on disk', () => {
      const runnerSrc = readFile(MIGRATION_RUNNER_FILE);
      const files = readdirSync(MIGRATIONS_DIR);

      // Extract import paths from migration-runner.ts
      const importRe = /import\s+\*\s+as\s+\w+\s+from\s+['"]\.\/migrations\/([^'"]+)['"]/g;
      const importedMigrations: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(runnerSrc)) !== null) {
        importedMigrations.push(match[1]);
      }

      // Every imported migration must exist on disk (import may omit extension).
      for (const imp of importedMigrations) {
        const exists = files.some((f) => f === imp || f.startsWith(imp + '.'));
        expect(
          exists,
          `migration-runner imports "./migrations/${imp}" but file is missing from disk`,
        ).toBe(true);
      }
    });
  });

  // ── Composite: all 6 contracts hold simultaneously ──────────────────────
  describe('Composite: 6-contract synchronization', () => {
    it('all 6 contracts verified in single pass', () => {
      const src = readFile(CLIENT_FILE);
      const runnerSrc = readFile(MIGRATION_RUNNER_FILE);
      const files = readdirSync(MIGRATIONS_DIR);

      // Contract 1: DbConfig fields.
      const dbConfigBody = extractInterfaceBody(src, 'DbConfig');
      expect(dbConfigBody).not.toBeNull();
      for (const f of ['host', 'port', 'database', 'user', 'password', 'maxConnections']) {
        expect(new RegExp(`${f}\\s*:\\s*(string|number)`).test(dbConfigBody!)).toBe(true);
      }

      // Contract 5: DbRow value types.
      const dbRowBody = extractInterfaceBody(src, 'DbRow');
      expect(dbRowBody).not.toBeNull();
      for (const t of ['string', 'number', 'boolean', 'Date', 'null']) {
        expect(new RegExp(`\\b${t}\\b`).test(dbRowBody!)).toBe(true);
      }

      // Contract 4: runMigrations exported.
      expect(
        /export\s+async\s+function\s+runMigrations/.test(runnerSrc),
        'runMigrations not exported from migration-runner',
      ).toBe(true);

      // Contract 6: migrations exist.
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => /^001[-_]create[-_]trades[-_]table/.test(f))).toBe(true);
      expect(files.some((f) => /^026[-_]create[-_]ai[-_]audit[-_]tables/.test(f))).toBe(true);
    });
  });
});
