/**
 * Worker-isolated test context harness for Vitest multi-worker execution.
 * Provides isolated temp directories, in-memory KV/DB stores, and mock HTTP servers.
 */

import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getWorkerId, ensureWorkerTempDir, cleanupWorkerTempDir } from './worker-temp-fs';

export interface MockHttpServer {
  server: http.Server;
  url: string;
  port: number;
  close(): Promise<void>;
}

export class InMemoryKVStore {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const keys = Array.from(this.store.keys());
    return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
  }

  clear(): void {
    this.store.clear();
  }
}

export interface DbResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export class InMemoryDbStore {
  private readonly tables = new Map<string, Array<Record<string, unknown>>>();

  async query<T = Record<string, unknown>>(table: string): Promise<DbResult<T>> {
    const rows = (this.tables.get(table) ?? []) as unknown as T[];
    return { rows: [...rows], rowCount: rows.length };
  }

  async insert<T extends Record<string, unknown>>(table: string, record: T): Promise<void> {
    const rows = this.tables.get(table) ?? [];
    rows.push({ ...record });
    this.tables.set(table, rows);
  }

  clear(): void {
    this.tables.clear();
  }
}

export interface WorkerIsolatedTestContext {
  readonly workerId: string;
  readonly workerDir: string;
  readonly kv: InMemoryKVStore;
  readonly db: InMemoryDbStore;
  createMockServer(
    handler?: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<MockHttpServer>;
  cleanup(): Promise<void>;
}

export async function createWorkerIsolatedTestContext(): Promise<WorkerIsolatedTestContext> {
  const workerId = getWorkerId();
  const workerDir = ensureWorkerTempDir();
  const kv = new InMemoryKVStore();
  const db = new InMemoryDbStore();
  const servers: MockHttpServer[] = [];

  const createMockServer = async (
    handler?: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<MockHttpServer> => {
    const srv = http.createServer(
      handler ??
        ((_, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', workerId }));
        })
    );

    await new Promise<void>((resolve, reject) => {
      srv.listen(0, '127.0.0.1', () => resolve());
      srv.on('error', reject);
    });

    const addr = srv.address() as AddressInfo;
    const mockServer: MockHttpServer = {
      server: srv,
      port: addr.port,
      url: `http://127.0.0.1:${addr.port}`,
      close: async () => {
        await new Promise<void>((res) => srv.close(() => res()));
      },
    };
    servers.push(mockServer);
    return mockServer;
  };

  const cleanup = async (): Promise<void> => {
    for (const s of servers) {
      await s.close().catch(() => {});
    }
    servers.length = 0;
    kv.clear();
    db.clear();
    cleanupWorkerTempDir();
  };

  return { workerId, workerDir, kv, db, createMockServer, cleanup };
}
