import { describe, expect, it, afterEach } from 'vitest';
import * as http from 'node:http';
import {
  createWorkerIsolatedTestContext,
  InMemoryKVStore,
  InMemoryDbStore,
} from '../../harness/worker-isolated-test-context';
import {
  getWorkerId,
  ensureWorkerTempDir,
  writeWorkerTempFile,
  readWorkerTempFile,
  cleanupWorkerTempDir,
  createScopedTempFs,
} from '../../harness/worker-temp-fs';

describe('worker-temp-fs', () => {
  afterEach(() => {
    cleanupWorkerTempDir();
  });

  it('retrieves worker id reliably', () => {
    const id = getWorkerId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('writes, reads, and cleans temporary files', () => {
    const dir = ensureWorkerTempDir();
    expect(dir).toBeDefined();

    const testFile = 'sub/sample.txt';
    const content = 'hello-worker-isolated';
    const filePath = writeWorkerTempFile(testFile, content);
    expect(filePath).toContain(testFile);

    const read = readWorkerTempFile(testFile);
    expect(read).toBe(content);

    const cleaned = cleanupWorkerTempDir();
    expect(cleaned).toBe(true);

    const afterClean = readWorkerTempFile(testFile);
    expect(afterClean).toBeUndefined();
  });

  it('creates and cleans scoped temp fs', () => {
    const scoped = createScopedTempFs('unit-test');
    scoped.writeFile('nested/data.json', '{"ok":true}');

    const read = scoped.readFile('nested/data.json');
    expect(read).toBe('{"ok":true}');

    expect(scoped.removeFile('nested/data.json')).toBe(true);
    expect(scoped.readFile('nested/data.json')).toBeUndefined();
    expect(scoped.cleanup()).toBe(true);
  });
});

describe('worker-isolated-test-context', () => {
  it('operates isolated KV store', async () => {
    const kv = new InMemoryKVStore();
    expect(await kv.get('missing')).toBeNull();

    await kv.put('key1', 'val1');
    await kv.put('key2', 'val2');
    expect(await kv.get('key1')).toBe('val1');

    const listed = await kv.list('key');
    expect(listed).toEqual(['key1', 'key2']);

    const deleted = await kv.delete('key1');
    expect(deleted).toBe(true);
    expect(await kv.get('key1')).toBeNull();

    kv.clear();
    expect(await kv.list()).toEqual([]);
  });

  it('operates isolated in-memory DB store', async () => {
    const db = new InMemoryDbStore();
    await db.insert('users', { id: 'u1', name: 'Alice' });
    await db.insert('users', { id: 'u2', name: 'Bob' });

    const result = await db.query<{ id: string; name: string }>('users');
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].name).toBe('Alice');

    db.clear();
    const emptyResult = await db.query('users');
    expect(emptyResult.rowCount).toBe(0);
  });

  it('creates isolated mock HTTP server and executes cleanup', async () => {
    const ctx = await createWorkerIsolatedTestContext();
    expect(ctx.workerId).toBeDefined();

    const mockServer = await ctx.createMockServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'pong' }));
    });

    const body = await new Promise<string>((resolve, reject) => {
      http.get(mockServer.url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });

    const parsed = JSON.parse(body) as { message: string };
    expect(parsed.message).toBe('pong');

    await ctx.cleanup();
  });
});
