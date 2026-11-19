/**
 * HTTP request body reader, loopback/CSRF/DNS-rebinding guards, Bearer auth,
 * and latch-state persistence helpers for the `GhostGuard` webhook server.
 */

import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import type { GhostGuardBridgeStats, GhostGuardLatchSnapshot } from './ghost-guard-types';

export const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;
export const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function isAuthorizedBearer(header: string | undefined, expectedToken: string): boolean {
  const expected = Buffer.from(`Bearer ${expectedToken}`, 'utf8');
  const actual = Buffer.from(header ?? '', 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sendWebhookJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
  closeConnection = false,
): void {
  const raw = JSON.stringify(body);
  const headers: Record<string, string | number> = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(raw),
  };
  if (closeConnection) {
    headers.connection = 'close';
    res.once('finish', () => { res.socket?.destroy(); });
  }
  res.writeHead(status, headers);
  res.end(raw);
}

export function guardLoopbackAndAuth(
  req: IncomingMessage,
  res: ServerResponse,
  bindHost: string,
  authToken: string | undefined,
  stats: GhostGuardBridgeStats,
  hasHmacAuth = false,
): boolean {
  if (LOOPBACK_HOSTS.has(bindHost)) {
    const hostHdr = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    if (hostHdr && !LOOPBACK_HOSTS.has(hostHdr)) {
      stats.unauthorizedRequests += 1;
      sendWebhookJson(res, 403, { ok: false, error: 'Forbidden host header' });
      return false;
    }
    if (!authToken && !hasHmacAuth && (req.headers.origin || req.headers['sec-fetch-site'])) {
      stats.unauthorizedRequests += 1;
      sendWebhookJson(res, 403, { ok: false, error: 'Browser cross-origin webhook forbidden' });
      return false;
    }
  }
  if (authToken && !isAuthorizedBearer(req.headers.authorization, authToken)) {
    stats.unauthorizedRequests += 1;
    sendWebhookJson(res, 401, { ok: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function readWebhookBody(
  req: IncomingMessage,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): Promise<{ ok: true; body: string } | { ok: false; status: number; error: string }> {
  const limit = Math.max(64, maxBytes);
  const declaredLen = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLen) && declaredLen > limit) {
    req.pause();
    return Promise.resolve({ ok: false, status: 413, error: 'Payload exceeds maximum allowed size' });
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const onData = (chunk: Buffer): void => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        settled = true;
        chunks.length = 0;
        req.off('data', onData);
        req.pause();
        resolve({ ok: false, status: 413, error: 'Payload exceeds maximum allowed size' });
        return;
      }
      chunks.push(chunk);
    };
    req.on('data', onData);
    req.on('end', () => {
      if (!settled) {
        settled = true;
        resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8') });
      }
    });
    req.on('error', (err) => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, status: 400, error: err.message });
      }
    });
  });
}

export async function readLatchSnapshot(filePath: string): Promise<GhostGuardLatchSnapshot | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { latched?: unknown }).latched === 'boolean' &&
      typeof (parsed as { updatedAtMs?: unknown }).updatedAtMs === 'number'
    ) {
      const snap = parsed as GhostGuardLatchSnapshot;
      return {
        latched: snap.latched,
        reason: typeof snap.reason === 'string' ? snap.reason : undefined,
        txHash: typeof snap.txHash === 'string' ? snap.txHash : undefined,
        updatedAtMs: snap.updatedAtMs,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeLatchSnapshot(
  filePath: string,
  snapshot: GhostGuardLatchSnapshot,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  await rename(tmpPath, filePath);
}
