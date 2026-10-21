/**
 * Coupon KV Store & Redeem Lock
 *
 * KV persistence for coupons plus the single-writer redeem lock that prevents
 * two concurrent redemptions from over-consuming a coupon's `maxUses`.
 *
 * Lock semantics: KV.put returns undefined only when the key was absent, so a
 * successful "create" doubles as lock acquisition. One retry after a short
 * backoff absorbs a racing holder that released between our failed put and retry.
 */

import { sanitizeCode } from './coupon-model';
import type { Coupon, Env } from './coupon-model';

/** Result of an operation that may fail with a structured HTTP error. */
export type LockOperation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

export interface LockResult<T> {
  ok: true;
  value: T;
}

/** Backoff (ms) before the single lock-acquisition retry. */
const REDEEM_LOCK_BACKOFF_MS = 50;
const COUPON_LOCK_BACKOFF_MS = 100;

/** Lock TTL — long enough for a redemption round-trip, short enough to self-heal. */
const LOCK_TTL_SECONDS = 60;

/** Load a coupon by code from KV, or null when absent/malformed. */
export async function loadCoupon(env: Env, code: string): Promise<Coupon | null> {
  const key = `coupon:${sanitizeCode(code)}`;
  const raw = await env.CACHE.get(key);
  return raw ? (JSON.parse(raw) as Coupon) : null;
}

/**
 * Acquire the redeem lock for `code`, run `fn` against the loaded coupon, then
 * release. Returns `{ ok: false, error: 'not_found', status: 404 }` when the
 * coupon is missing, so callers surface a structured 404 instead of throwing.
 */
export async function withRedeemLock(
  env: Env,
  code: string,
  fn: (coupon: Coupon) => Promise<LockOperation<Coupon>>,
): Promise<LockOperation<Coupon>> {
  const lockKey = `lock:coupon:${code}`;
  let acquired = (await env.CACHE.put(lockKey, '1', { expirationTtl: LOCK_TTL_SECONDS })) === undefined;
  if (!acquired) {
    await new Promise((r) => setTimeout(r, REDEEM_LOCK_BACKOFF_MS));
    acquired = (await env.CACHE.put(lockKey, '1', { expirationTtl: LOCK_TTL_SECONDS })) === undefined;
  }
  try {
    const coupon = await loadCoupon(env, code);
    if (!coupon) return { ok: false, error: 'not_found', status: 404 };
    return await fn(coupon);
  } finally {
    await env.CACHE.delete(lockKey).catch(() => {});
  }
}

/**
 * Acquire the redeem lock for `code`, run `fn` against the loaded coupon, then
 * release. Throws `Error('not_found')` when the coupon is missing, so callers
 * can use try/catch uniformly.
 */
export async function withCouponLock<T>(
  env: Env,
  code: string,
  fn: (coupon: Coupon) => Promise<T>,
): Promise<T> {
  const lockKey = `lock:coupon:${code}`;
  let acquired = (await env.CACHE.put(lockKey, '1', { expirationTtl: LOCK_TTL_SECONDS })) === undefined;
  if (!acquired) {
    await new Promise(r => setTimeout(r, COUPON_LOCK_BACKOFF_MS));
    acquired = (await env.CACHE.put(lockKey, '1', { expirationTtl: LOCK_TTL_SECONDS })) === undefined;
  }
  try {
    const coupon = await loadCoupon(env, code);
    if (!coupon) throw new Error('not_found');
    return await fn(coupon);
  } finally {
    await env.CACHE.delete(lockKey).catch(() => {});
  }
}
