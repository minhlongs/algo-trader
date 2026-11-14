/**
 * HTTP request body reader, loopback/CSRF/DNS-rebinding guards, and Bearer auth
 * helpers for the `GhostGuard` loopback webhook server.
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GhostGuardBridgeStats } from './ghost-guard-types';

export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
export const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function isAuthorizedBearer(header: string | undefined, expectedToken: string): boolean {
  const expected = Buffer.from(`Bearer ${expectedToken}`, 'utf8');
  const actual = Buffer.from(header ?? '', 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sendWebhookJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(raw),
  });
  res.end(raw);
}

export function guardLoopbackAndAuth(
  req: IncomingMessage,
  res: ServerResponse,
  bindHost: string,
  authToken: string | undefined,
  stats: GhostGuardBridgeStats,
): boolean {
  if (LOOPBACK_HOSTS.has(bindHost)) {
    const hostHdr = (req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    if (hostHdr && !LOOPBACK_HOSTS.has(hostHdr)) {
      stats.unauthorizedRequests += 1;
      sendWebhookJson(res, 403, { ok: false, error: 'Forbidden host header' });
      return false;
    }
    if (!authToken && (req.headers.origin || req.headers['sec-fetch-site'])) {
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
): Promise<{ ok: true; body: string } | { ok: false; status: number; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_WEBHOOK_BODY_BYTES) {
        settled = true;
        resolve({ ok: false, status: 413, error: 'Payload exceeds maximum allowed size' });
        return;
      }
      chunks.push(chunk);
    });
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
