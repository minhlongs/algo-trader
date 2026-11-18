/**
 * POLY-G5 Public Beta — Linearizable Durable-Object Rate Limiter.
 *
 * Eliminates non-atomic KV read-modify-write races and Cloudflare KV's 1-write/sec
 * per-key ceiling by serializing slot increments inside `TENANT_PAPER_ENGINE`
 * (`idFromName('rl:' + bucketKey)` -> `POST /rate-limit`).
 */

import type { PolyBetaEnv } from './poly-beta-types';
import type { DoStorageLike } from './tenant-paper-engine-actions';

let localFallbackChain: Promise<unknown> = Promise.resolve();
const localFallbackSlots = new Map<string, number>();

export async function consumeDoRateLimitSlot(
  storage: DoStorageLike,
  env: PolyBetaEnv,
  body: Record<string, unknown>,
): Promise<Response> {
  const bucketKey = String(body.bucketKey ?? '');
  const limit = Math.max(1, Number(body.limit) || 1);
  const windowSec = Math.max(1, Number(body.windowSec) || 60);
  const nowMs = typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : Date.now();
  if (!bucketKey) {
    return new Response(JSON.stringify({ allowed: false, remaining: 0 }), { status: 400 });
  }

  const slot = Math.floor(nowMs / (windowSec * 1_000));
  const slotKey = `rl:${bucketKey}:${slot}`;
  const activeSlot = await storage.get<number>('rlActiveSlot');
  if (activeSlot !== undefined && activeSlot !== slot) {
    await storage.deleteAll();
  }

  let current = await storage.get<number>(slotKey);
  if (current === undefined) {
    const seededRaw = env.POLY_BETA_KV ? await env.POLY_BETA_KV.get(slotKey) : null;
    current = seededRaw ? Number.parseInt(seededRaw, 10) || 0 : 0;
  }

  if (current >= limit) {
    return new Response(JSON.stringify({ allowed: false, remaining: 0 }), { status: 200 });
  }

  const next = current + 1;
  await storage.put('rlActiveSlot', slot);
  await storage.put(slotKey, next);
  if (activeSlot !== slot) {
    await storage.setAlarm((slot + 1) * windowSec * 1_000 + 2_000);
  }
  return new Response(
    JSON.stringify({ allowed: true, remaining: Math.max(0, limit - next) }),
    { status: 200 },
  );
}

export async function checkRateLimit(
  env: PolyBetaEnv,
  bucketKey: string,
  limit: number,
  windowSec: number,
  nowMs = Date.now(),
): Promise<{ allowed: boolean; remaining: number }> {
  if (env.TENANT_PAPER_ENGINE && typeof env.TENANT_PAPER_ENGINE.idFromName === 'function') {
    const doId = env.TENANT_PAPER_ENGINE.idFromName(`rl:${bucketKey}`);
    const stub = env.TENANT_PAPER_ENGINE.get(doId);
    const res = await stub.fetch('https://poly-beta.internal/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketKey, limit, windowSec, nowMs }),
    });
    if (res.ok) {
      return (await res.json()) as { allowed: boolean; remaining: number };
    }
  }

  const prev = localFallbackChain;
  let release!: () => void;
  localFallbackChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    const slot = Math.floor(nowMs / (windowSec * 1_000));
    const key = `rl:${bucketKey}:${slot}`;
    let current = localFallbackSlots.get(key);
    if (current === undefined) {
      const raw = await env.POLY_BETA_KV.get(key);
      current = raw ? Number.parseInt(raw, 10) || 0 : 0;
    }
    if (current >= limit) {
      return { allowed: false, remaining: 0 };
    }
    localFallbackSlots.set(key, current + 1);
    return { allowed: true, remaining: Math.max(0, limit - (current + 1)) };
  } finally {
    release();
  }
}
