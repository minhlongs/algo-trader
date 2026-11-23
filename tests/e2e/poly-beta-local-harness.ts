/**
 * Local E2E Server Harness for Paper Beta (100% local, zero Cloudflare network calls).
 *
 * Serves the compiled `VITE_APP_MODE=poly-beta` static dashboard and routes `/api/beta/*`
 * directly to the real in-process `poly-beta-worker.ts` backed by `node:sqlite` D1
 * (`0001`, `0002`, `0003`) + `TenantPaperEngine` DO + deterministic seeded markets.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, normalize, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import worker from '../../src/platform/poly-beta/poly-beta-worker';
import type { PolyBetaEnv } from '../../src/platform/poly-beta/poly-beta-types';
import {
  buildTestInvitesJson,
  createPolyBetaTestHarness,
} from '../poly-beta/poly-beta-test-harness';

export interface LocalPolyBetaInviteInput {
  rawToken: string;
  email: string;
  expiresAtMs?: number;
  disabled?: boolean;
}

export interface LocalPolyBetaServerOptions {
  distDir: string;
  allowlistedEmails: readonly string[];
  invites: readonly LocalPolyBetaInviteInput[];
  maintenanceMode?: string | undefined;
  marketDataEnabled?: string | undefined;
}

export interface LocalPolyBetaServer {
  baseUrl: string;
  rawSqlite: DatabaseSync;
  env: PolyBetaEnv;
  close: () => Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', rejectBody);
  });
}

function serveStaticFile(distDir: string, pathname: string, res: ServerResponse): void {
  const rootDir = resolve(distDir);
  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(rootDir, normalize(relPath));

  let targetFile = resolve(rootDir, 'index.html');
  if (candidate.startsWith(rootDir) && existsSync(candidate) && statSync(candidate).isFile()) {
    targetFile = candidate;
  }

  const ext = extname(targetFile).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const body = readFileSync(targetFile);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(body.byteLength),
  });
  res.end(body);
}

export async function startLocalPolyBetaServer(
  options: LocalPolyBetaServerOptions,
): Promise<LocalPolyBetaServer> {
  const distDir = resolve(options.distDir);
  if (!existsSync(resolve(distDir, 'index.html'))) {
    throw new Error(`Compiled poly-beta dashboard not found at ${distDir}`);
  }

  const harness = await createPolyBetaTestHarness({
    signupAllowlist: options.allowlistedEmails.join(','),
    signupInvites: buildTestInvitesJson(options.invites),
    ...(options.maintenanceMode !== undefined ? { maintenanceMode: options.maintenanceMode } : {}),
    ...(options.marketDataEnabled !== undefined ? { marketDataEnabled: options.marketDataEnabled } : {}),
  });

  let baseUrl = '';

  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', baseUrl || 'http://127.0.0.1');
      if (reqUrl.pathname.startsWith('/api/beta/') || reqUrl.pathname === '/api/health' || reqUrl.pathname === '/health') {
        const method = (req.method ?? 'GET').toUpperCase();
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const item of value) headers.append(key, item);
          } else {
            headers.set(key, value);
          }
        }

        const hasBody = method !== 'GET' && method !== 'HEAD';
        const bodyBuf = hasBody ? await readRequestBody(req) : undefined;
        const webReq = new Request(`${baseUrl}${req.url ?? '/'}`, {
          method,
          headers,
          ...(hasBody && bodyBuf && bodyBuf.byteLength > 0 ? { body: bodyBuf } : {}),
        });

        const webRes = await worker.fetch(webReq, harness.env);
        const setCookies =
          typeof webRes.headers.getSetCookie === 'function' ? webRes.headers.getSetCookie() : [];

        res.statusCode = webRes.status;
        webRes.headers.forEach((value, key) => {
          if (key.toLowerCase() === 'set-cookie') return;
          res.setHeader(key, value);
        });
        if (setCookies.length > 0) {
          res.setHeader('set-cookie', setCookies);
        }

        const resBuf = Buffer.from(await webRes.arrayBuffer());
        res.end(resBuf);
        return;
      }

      serveStaticFile(distDir, reqUrl.pathname, res);
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Local E2E harness error', code: 'LOCAL_HARNESS_ERROR' }));
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
  harness.env.ALLOWED_ORIGINS = baseUrl;

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolveClose) => {
      server.close(() => resolveClose());
    });
    harness.rawSqlite.close();
  };

  return {
    baseUrl,
    rawSqlite: harness.rawSqlite,
    env: harness.env,
    close,
  };
}
