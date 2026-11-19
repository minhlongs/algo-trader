/**
 * `GhostGuard` webhook payload handler and authenticated HTTP receiver.
 *
 * Any authenticated `FillVerdict::Ghost`, `FillVerdict::Timeout`, or `GhostFillEvent`
 * immediately invokes `killSwitch.fire(...)` synchronously latching `PolyKillSwitch`
 * and issuing CLOB `DELETE /cancel-all` on the first trigger.
 */

import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { PolyKillSwitch } from '../risk/poly-kill-switch';
import { createGhostGuardHmacVerifier, hasUsableKeyRing } from './ghost-guard-auth';
import {
  LOOPBACK_HOSTS,
  MAX_WEBHOOK_BODY_BYTES,
  guardLoopbackAndAuth,
  readLatchSnapshot,
  readWebhookBody,
  sendWebhookJson,
  writeLatchSnapshot,
} from './ghost-guard-http-helpers';
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
      stats.ghostVerdicts += 1; verdictKind = 'Ghost'; reason = data.reason || 'unspecified'; counterparty = data.counterparty;
    } else {
      stats.timeoutVerdicts += 1; verdictKind = 'Timeout'; reason = 'timeout';
    }
  } else {
    stats.ghostFillEvents += 1; verdictKind = 'GhostFillEvent';
    reason = data.reason || 'unspecified'; counterparty = data.counterparty; market = data.market || 'unknown';
  }

  const fireReason = `ghost-guard:${verdictKind}:tx=${data.tx_hash}:reason=${reason}`;
  // Fire synchronously before awaiting so killSwitch.isFired() latches immediately.
  const fireResult = await killSwitch.fire(fireReason);
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

export async function startGhostGuardWebhookServer(
  options: GhostGuardWebhookServerOptions,
): Promise<GhostGuardWebhookServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_WEBHOOK_BODY_BYTES;
  const hasBearer = Boolean(options.authToken && options.authToken.trim().length > 0);
  const hasHmac = Boolean(options.hmacAuth && hasUsableKeyRing(options.hmacAuth.keyRing));

  if (options.requireHmac && !hasHmac) {
    throw new Error('Refusing to start GhostGuard webhook server with requireHmac=true and no usable keyRing');
  }
  if (!LOOPBACK_HOSTS.has(host) && !hasBearer && !hasHmac) {
    throw new Error(`Refusing to bind GhostGuard webhook server to non-loopback host "${host}" without authToken or hmacAuth`);
  }
  if (options.latchStatePath) {
    const snap = await readLatchSnapshot(options.latchStatePath);
    if (snap?.latched && !options.killSwitch.isFired()) {
      await options.killSwitch.fire(snap.reason ?? 'ghost-guard:rehydrated-latch');
    }
  }

  const verifier = options.hmacAuth ? createGhostGuardHmacVerifier(options.hmacAuth) : undefined;
  const stats: GhostGuardBridgeStats = createEmptyGhostGuardStats();
  const sockets = new Set<Socket>();

  const server = createServer(async (req, res) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (!guardLoopbackAndAuth(req, res, host, options.authToken, stats, Boolean(verifier))) return;
    if (req.method === 'GET' && pathname === '/health') {
      sendWebhookJson(res, 200, { ok: true, latched: options.killSwitch.isFired() });
      return;
    }
    if (req.method !== 'POST') return sendWebhookJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    if (pathname !== '/ghost-alert') return sendWebhookJson(res, 404, { ok: false, error: 'Not Found' });
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) {
      stats.invalidPayloads += 1;
      return sendWebhookJson(res, 415, { ok: false, error: 'Expected application/json content-type' });
    }
    const readRes = await readWebhookBody(req, maxBodyBytes);
    if (!readRes.ok) {
      stats.invalidPayloads += 1;
      return sendWebhookJson(res, readRes.status, { ok: false, error: readRes.error }, true);
    }
    if (verifier) {
      const preCheck = verifier.verifyHeadersPreBody(req.headers);
      if (!preCheck.ok) {
        stats.unauthorizedRequests += 1;
        return sendWebhookJson(res, 401, { ok: false, error: preCheck.error });
      }
    }
    let decoded: unknown;
    try { decoded = JSON.parse(readRes.body); }
    catch {
      stats.invalidPayloads += 1;
      return sendWebhookJson(res, 400, { ok: false, error: 'Malformed JSON body' });
    }
    if (verifier) {
      const authRes = verifier.verifyAndConsume(req.headers, decoded);
      if (!authRes.ok) {
        stats.unauthorizedRequests += 1;
        if (authRes.isReplay) stats.replayRejections += 1;
        return sendWebhookJson(res, 401, { ok: false, error: authRes.error });
      }
    }
    const result = await handleGhostGuardPayload(decoded, options.killSwitch, {
      stats, onGhostFill: options.onGhostFill, nowMs: options.nowMs,
    });
    if (result.ok && result.latched && options.latchStatePath) {
      await writeLatchSnapshot(options.latchStatePath, {
        latched: true, reason: result.fireReason, txHash: result.txHash, updatedAtMs: Date.now(),
      });
    }
    sendWebhookJson(res, result.ok ? 200 : 400, { ...result });
  });

  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
  });

  const addr = server.address() as AddressInfo;
  const formattedHost = host.includes(':') ? `[${host}]` : host;
  return {
    host, port: addr.port, url: `http://${formattedHost}:${addr.port}/ghost-alert`,
    getStats: () => ({ ...stats }),
    close: () => new Promise<void>((resolve, reject) => {
      for (const s of sockets) s.destroy();
      sockets.clear();
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}
