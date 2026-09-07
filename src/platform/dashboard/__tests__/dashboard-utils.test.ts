/**
 * dashboard-utils — Unit Tests
 *
 * Covers src/platform/dashboard/dashboard-utils.ts:
 * - MIME_TYPES map
 * - sendJson (status, Content-Type, Content-Length, body)
 * - serveStatic (found file, 404, unknown extension MIME fallback)
 */

import { describe, it, expect, vi } from 'vitest';
import { MIME_TYPES, sendJson, serveStatic } from '../dashboard-utils';
import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;

function createMockRes(): ServerResponse {
  const res: Partial<ServerResponse> = {
    headers: {} as Record<string, string>,
    writeHead: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as ServerResponse;
}

describe('dashboard-utils — MIME_TYPES', () => {
  it('maps html, js, css, json, ico', () => {
    expect(MIME_TYPES['.html']).toBe('text/html; charset=utf-8');
    expect(MIME_TYPES['.js']).toBe('application/javascript; charset=utf-8');
    expect(MIME_TYPES['.css']).toBe('text/css; charset=utf-8');
    expect(MIME_TYPES['.json']).toBe('application/json; charset=utf-8');
    expect(MIME_TYPES['.ico']).toBe('image/x-icon');
  });
});

describe('dashboard-utils — sendJson', () => {
  it('writes JSON body with status, content-type and content-length', () => {
    const res = createMockRes();
    sendJson(res, 201, { ok: true, n: 1 });

    const body = JSON.stringify({ ok: true, n: 1 });
    expect(res.writeHead).toHaveBeenCalledWith(201, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    expect(res.end).toHaveBeenCalledWith(body);
  });

  it('handles null and array payloads', () => {
    const res = createMockRes();
    sendJson(res, 200, null);
    expect(res.end).toHaveBeenCalledWith('null');

    const res2 = createMockRes();
    sendJson(res2, 200, [1, 2, 3]);
    expect(res2.end).toHaveBeenCalledWith('[1,2,3]');
  });

  it('handles unicode content correctly via Buffer.byteLength', () => {
    const res = createMockRes();
    sendJson(res, 200, { msg: 'héllo wörld 🚀' });
    const body = JSON.stringify({ msg: 'héllo wörld 🚀' });
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
  });
});

describe('dashboard-utils — serveStatic', () => {
  it('serves file with correct MIME type', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('<html>hi</html>'));
    const res = createMockRes();

    await serveStatic(res, '/public/index.html');

    expect(mockReadFile).toHaveBeenCalledWith('/public/index.html');
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    expect(res.end).toHaveBeenCalledWith(Buffer.from('<html>hi</html>'));
  });

  it('serves .js as application/javascript', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('console.log(1)'));
    const res = createMockRes();

    await serveStatic(res, '/public/app.js');

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
    });
  });

  it('serves .css as text/css', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('body{}'));
    const res = createMockRes();

    await serveStatic(res, '/public/style.css');

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'text/css; charset=utf-8',
    });
  });

  it('serves .json as application/json', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('{}'));
    const res = createMockRes();

    await serveStatic(res, '/public/data.json');

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
  });

  it('falls back to application/octet-stream for unknown extension', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('binary'));
    const res = createMockRes();

    await serveStatic(res, '/public/file.wasm');

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/octet-stream',
    });
  });

  it('falls back to application/octet-stream for extensionless path', async () => {
    mockReadFile.mockResolvedValueOnce(Buffer.from('noext'));
    const res = createMockRes();

    await serveStatic(res, '/public/Makefile');

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      'Content-Type': 'application/octet-stream',
    });
  });

  it('returns 404 when readFile throws', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const res = createMockRes();

    await serveStatic(res, '/public/missing.html');

    const body = '404 Not Found';
    expect(res.writeHead).toHaveBeenCalledWith(404, {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(body),
    });
    expect(res.end).toHaveBeenCalledWith(body);
  });
});