/**
 * PostgresClient (desk layer) — Unit Tests
 *
 * Covers the stub client: query/execute return empty results,
 * transaction no-ops, isConnected false, lazy singleton init via
 * getPostgresClient, and the named query export.
 */

import { describe, it, expect } from 'vitest';
import {
  createPostgresClient,
  getPostgresClient,
  query,
} from '../postgres-client';

describe('createPostgresClient', () => {
  it('returns a client with all PostgresClient methods', () => {
    const client = createPostgresClient();
    expect(typeof client.query).toBe('function');
    expect(typeof client.execute).toBe('function');
    expect(typeof client.beginTransaction).toBe('function');
    expect(typeof client.commit).toBe('function');
    expect(typeof client.rollback).toBe('function');
    expect(typeof client.isConnected).toBe('function');
  });

  it('query returns empty result with rowCount 0', async () => {
    const client = createPostgresClient();
    const result = await client.query('SELECT 1');
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('query accepts typed generic', async () => {
    const client = createPostgresClient();
    const result = await client.query<{ id: number }>('SELECT id FROM t');
    expect(result.rows).toEqual([] as { id: number }[]);
    expect(result.rowCount).toBe(0);
  });

  it('query accepts values array', async () => {
    const client = createPostgresClient();
    const result = await client.query('SELECT * FROM t WHERE id = $1', [42]);
    expect(result.rowCount).toBe(0);
  });

  it('execute returns empty result with rowCount 0', async () => {
    const client = createPostgresClient();
    const result = await client.execute('INSERT INTO t VALUES ($1)', [1]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('transaction methods resolve without error', async () => {
    const client = createPostgresClient();
    await expect(client.beginTransaction()).resolves.toBeUndefined();
    await expect(client.commit()).resolves.toBeUndefined();
    await expect(client.rollback()).resolves.toBeUndefined();
  });

  it('isConnected returns false for stub client', () => {
    const client = createPostgresClient();
    expect(client.isConnected()).toBe(false);
  });
});

describe('getPostgresClient — lazy singleton', () => {
  it('returns a client on first call', () => {
    const client = getPostgresClient();
    expect(typeof client.query).toBe('function');
  });
});

describe('named query export', () => {
  it('returns empty rows and rowCount 0', async () => {
    const result = await query('SELECT 1');
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('accepts values array and generic type', async () => {
    const result = await query<{ id: number }>('SELECT id FROM t WHERE id = $1', [7]);
    expect(result.rows).toEqual([] as { id: number }[]);
    expect(result.rowCount).toBe(0);
  });
});
