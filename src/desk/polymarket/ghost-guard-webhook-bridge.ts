/**
 * `GhostGuard` webhook payload handler and loopback HTTP receiver (`127.0.0.1`).
 *
 * Any `FillVerdict::Ghost`, `FillVerdict::Timeout`, or `GhostFillEvent` immediately
 * invokes `killSwitch.fire(...)` synchronously latching `PolyKillSwitch` and issuing
 * CLOB `DELETE /cancel-all` on the first trigger.
 */

import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { PolyKillSwitch } from '../risk/poly-kill-switch';
import {
  createEmptyGhostGuardStats,
  ghostGuardWebhookPayloadSchema,
  type GhostGuardAlertSummary,
  type GhostGuardBridgeOptions,
  type GhostGuardBridgeStats,
  type GhostGuardHandleResult,
  type GhostGuardWebhookServer,
  type GhostGuardWebhookServerOptions,
} from './ghost-guard-types';

const MAX_BODY_BYTES = 256 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  const expected = Buffer.from(`Bearer ${expectedToken}`, 'utf8');
  const actual = Buffer.from(header ?? '', 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function handleGhostGuardPayload(
  payload: unknown,
  killSwitch: PolyKillSwitch,
  opts: GhostGuardBridgeOptions = {},
): Promise<GhostGuardHandleResult> {
  const now = opts.nowMs ?? (() => performance.now());
  const startedAt = now();
  const stats = opts.stats ?? createEmptyGhostGuardStats();

  const parsed = ghostGuardWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    stats.invalidPayloads += 1;
    return {
      ok: false, latched: killSwitch.isFired(), issued: false,
      latencyMs: Math.max(0, now() - startedAt),
      error: parsed.error.issues.map((i) => `${i.path.join('.') || 'root'}: ${i.message}`).join('; '),
    };
  }

  stats.totalPayloads += 1;
  const data = parsed.data;
  stats.lastTxHash = data.tx_hash;

  if ('verdict' in data && data.verdict === 'Real') {
    stats.realVerdicts += 1;
    return {
      ok: true, kind: 'Real', txHash: data.tx_hash,
      latched: killSwitch.isFired(), issued: false,
      latencyMs: Math.max(0, now() - startedAt),
    };
  }

  let verdictKind: 'Ghost' | 'Timeout' | 'GhostFillEvent';
  let reason: string;
  let counterparty: string | null | undefined;
  let market: string | undefined;

  if ('verdict' in data) {
    if (data.verdict === 'Ghost') {
      stats.ghostVerdicts += 1; verdictKind = 'Ghost'; reason = data.reason; counterparty = data.counterparty;
    } else {
      stats.timeoutVerdicts += 1; verdictKind = 'Timeout'; reason = 'timeout';
    }
  } else {
    stats.ghostFillEvents += 1; verdictKind = 'GhostFillEvent';
    reason = data.reason; counterparty = data.counterparty; market = data.market;
  }

  const fireReason = `ghost-guard:${verdictKind}:tx=${data.tx_hash}:reason=${reason}`;
  // Fire synchronously before awaiting so killSwitch.isFired() latches immediately.
  const firePromise = killSwitch.fire(fireReason);
  const fireResult = await firePromise;

  if (fireResult.issued) stats.killSwitchFires += 1;
  else stats.idempotentReplays += 1;
  stats.lastTriggeredReason = fireReason;

  const alert: GhostGuardAlertSummary = {
    kind: verdictKind, txHash: data.tx_hash, reason, counterparty, market, fireReason, issued: fireResult.issued,
  };
  opts.onGhostFill?.(alert);

  return {
    ok: true, kind: verdictKind, txHash: data.tx_hash,
    latched: killSwitch.isFired(), issued: fireResult.issued,
    latencyMs: Math.max(0, now() - startedAt), fireReason,
  };
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(raw) });
  res.end(raw);
}

function readRequestBody(req: IncomingMessage): Promise<{ ok: true; body: string } | { ok: false; status: number; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0, settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        settled = true;
        resolve({ ok: false, status: 413, error: 'Payload exceeds maximum allowed size' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8') }); } });
    req.on('error', (err) => { if (!settled) { settled = true; resolve({ ok: false, status: 400, error: err.message }); } });
  });
}

export async function startGhostGuardWebhookServer(
  options: GhostGuardWebhookServerOptions,
): Promise<GhostGuardWebhookServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  if (!LOOPBACK_HOSTS.has(host) && (!options.authToken || options.authToken.trim().length === 0)) {
    throw new Error(`Refusing to bind GhostGuard webhook server to non-loopback host "${host}" without authToken`);
  }

  const stats: GhostGuardBridgeStats = createEmptyGhostGuardStats();
  const sockets = new Set<Socket>();

  const server = createServer(async (req, res) => {
    if (options.authToken && !isAuthorized(req.headers.authorization, options.authToken)) {
      stats.unauthorizedRequests += 1;
      sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, latched: options.killSwitch.isFired() });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      return;
    }
    const readRes = await readRequestBody(req);
    if (!readRes.ok) {
      stats.invalidPayloads += 1;
      sendJson(res, readRes.status, { ok: false, error: readRes.error });
      return;
    }
    let decoded: unknown;
    try { decoded = JSON.parse(readRes.body); }
    catch {
      stats.invalidPayloads += 1;
      sendJson(res, 400, { ok: false, error: 'Malformed JSON body' });
      return;
    }
    const result = await handleGhostGuardPayload(decoded, options.killSwitch, {
      stats, onGhostFill: options.onGhostFill, nowMs: options.nowMs,
    });
    sendJson(res, result.ok ? 200 : 400, { ...result });
  });

  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
  });

  const addr = server.address() as AddressInfo;
  return {
    host, port: addr.port, url: `http://${host}:${addr.port}/ghost-alert`,
    getStats: () => ({ ...stats }),
    close: () => new Promise<void>((resolve, reject) => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}
