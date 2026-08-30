/**
 * PostgreSQL Client Tests
 *
 * Covers the full client surface: getDbClient singleton + config merge,
 * query passthrough, transaction commit/rollback/release, and closeDbConnection.
 * The real `pg` pool is replaced with a deterministic mock via vi.hoist so no
 * network is touched and the module-level `pool` singleton can be reset between
 * tests by calling closeDbConnection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// hoisted mock factory for the `pg` module — vi.hoist lets us reference it
// before the import statement below executes (required because the import
// above is hoisted by the loader).
const { mockPool, mockConnect, poolCtor } = vi.hoisted(() => {
  const query = vi.fn(async () => ({ rows: [{ id: 1 }], rowCount: 1 }));
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const end = vi.fn();
  const on = vi.fn();
  const pool = { query, on, end, connect };
  // vi.fn used as a constructor via `new Pool(...)` must return a real object.
  const poolCtor = vi.fn(function PoolMock(_config: unknown) {
    return pool;
  });
  return { mockPool: pool, mockConnect: connect, poolCtor };
});

vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual, Pool: poolCtor },
    Pool: poolCtor,
  };
});

// import after the mock is registered so the module picks up the fake pool
import { getDbClient, query, transaction, closeDbConnection } from '../postgres-client';

describe('getDbClient', () => {
  beforeEach(() => {
    mockPool.on.mockClear();
    mockConnect.mockClear();
    mockPool.end.mockClear();
    poolCtor.mockClear();
  });

  afterEach(async () => {
    await closeDbConnection();
  });

  it('returns the same singleton pool on repeated calls', () => {
    const a = getDbClient();
    const b = getDbClient();
    expect(a).toBe(b);
    expect(mockPool.on).toHaveBeenCalledTimes(1);
    expect(mockPool.on.mock.calls[0]![0]).toBe('error');
  });

  it('registers the pool error handler so it can be invoked', () => {
    getDbClient();
    const handler = mockPool.on.mock.calls[0]![1] as (err: Error) => void;
    expect(() => handler(new Error('idle client crash'))).not.toThrow();
  });

  it('falls back to defaults when env vars are unset', () => {
    const saved = { ...process.env };
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    try {
      getDbClient();
      const poolArg = poolCtor.mock.calls[0]![0];
      expect(poolArg.host).toBe('localhost');
      expect(poolArg.port).toBe(5432);
      expect(poolArg.database).toBe('algo_trader');
      expect(poolArg.user).toBe('postgres');
      expect(poolArg.password).toBe('');
      expect(poolArg.maxConnections).toBe(10);
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it('merges overrides on top of defaults', async () => {
    await closeDbConnection();
    const saved = process.env.DB_HOST;
    process.env.DB_HOST = 'db.example';
    try {
      getDbClient({ maxConnections: 50 });
      const poolArg = poolCtor.mock.calls[0]![0];
      expect(poolArg.host).toBe('db.example');
      expect(poolArg.maxConnections).toBe(50);
    } finally {
      process.env.DB_HOST = saved!;
    }
  });
});

describe('query', () => {
  beforeEach(async () => {
    await closeDbConnection();
    mockPool.query.mockClear();
  });

  it('forwards text and params to the pool', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ a: 1 }], rowCount: 1 } as never);
    const result = await query('SELECT $1::int AS a', [1]);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT $1::int AS a', [1]);
    expect(result.rows).toEqual([{ a: 1 }]);
  });

  it('passes undefined params through when omitted', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    await query('SELECT 1');
    expect(mockPool.query).toHaveBeenCalledWith('SELECT 1', undefined);
  });
});

describe('transaction', () => {
  let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    await closeDbConnection();
    client = { query: vi.fn(), release: vi.fn() };
    mockConnect.mockResolvedValueOnce(client as never);
  });

  it('begins, runs the callback, commits, and releases', async () => {
    const result = await transaction(async (c) => {
      expect(c).toBe(client);
      return { ok: true };
    });
    expect(result).toEqual({ ok: true });
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.query).not.toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and rethrows when the callback throws', async () => {
    const boom = new Error('boom');
    await expect(
      transaction(async () => {
        throw boom;
      }),
    ).rejects.toThrow('boom');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('closeDbConnection', () => {
  beforeEach(async () => {
    await closeDbConnection();
    mockPool.end.mockClear();
    poolCtor.mockClear();
  });

  it('no-ops when no pool exists', async () => {
    await closeDbConnection();
    expect(mockPool.end).not.toHaveBeenCalled();
  });

  it('closes the pool and clears the singleton', async () => {
    getDbClient();
    expect(poolCtor).toHaveBeenCalledTimes(1);
    await closeDbConnection();
    expect(mockPool.end).toHaveBeenCalledTimes(1);
    // subsequent getDbClient builds a fresh pool (singleton was cleared)
    getDbClient();
    expect(poolCtor).toHaveBeenCalledTimes(2);
  });
});