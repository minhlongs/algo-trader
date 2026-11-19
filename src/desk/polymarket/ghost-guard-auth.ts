/**
 * Authenticated HMAC-SHA256 signing and verification for `GhostGuard` callbacks.
 *
 * Matches `sidecars/ghost-guard/src/callback.rs`: deterministic key-sorted JSON,
 * constant-time `timingSafeEqual` verification, bounded clock-skew window,
 * synchronous nonce replay protection, source allowlist, and multi-key rotation.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import type { GhostGuardHmacAuthOptions } from './ghost-guard-types';

export const GHOST_GUARD_HEADER_TIMESTAMP = 'x-ghostguard-timestamp';
export const GHOST_GUARD_HEADER_NONCE = 'x-ghostguard-nonce';
export const GHOST_GUARD_HEADER_SOURCE = 'x-ghostguard-source';
export const GHOST_GUARD_HEADER_KEY_ID = 'x-ghostguard-key-id';
export const GHOST_GUARD_HEADER_SIGNATURE = 'x-ghostguard-signature';

export const DEFAULT_MAX_SKEW_MS = 30_000;
export const DEFAULT_NONCE_TTL_MS = 60_000;
export const DEFAULT_MAX_NONCE_ENTRIES = 10_000;

const HEX_64_RE = /^[0-9a-f]{64}$/;
const EPOCH_MS_RE = /^\d{1,16}$/;
const NONCE_RE = /^[\x21-\x7e]{1,128}$/;

export interface CanonicalSigningParts {
  timestampMs: number | string; nonce: string; sourceId: string; keyId: string; canonicalBody: string;
}

export interface SignGhostGuardParams {
  secret: string; timestampMs: number; nonce: string; sourceId: string; keyId: string; payload: unknown;
}

export interface SignedGhostGuardRequest {
  canonicalBody: string; signature: string; headers: Record<string, string>;
}

interface ParsedAuthHeaders {
  timestampMs: number; nonce: string; sourceId: string; keyId: string; signatureHex: string; secret: string;
}

export type GhostGuardAuthFailure = { ok: false; error: string; isReplay?: boolean };
export type GhostGuardHeaderCheckResult = { ok: true; meta: ParsedAuthHeaders } | GhostGuardAuthFailure;
export type GhostGuardVerifyResult =
  | { ok: true; keyId: string; sourceId: string; nonce: string }
  | GhostGuardAuthFailure;

export interface GhostGuardHmacVerifier {
  verifyHeadersPreBody(headers: IncomingHttpHeaders): GhostGuardHeaderCheckResult;
  verifyAndConsume(headers: IncomingHttpHeaders, parsedBody: unknown): GhostGuardVerifyResult;
  getCachedNonceCount(): number;
}

/** Deterministic key-sorted compact JSON matching Rust `callback::canonical_json_string`. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalizeJson(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const pairs: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const entry = record[key];
    if (entry !== undefined) pairs.push(`${JSON.stringify(key)}:${canonicalizeJson(entry)}`);
  }
  return `{${pairs.join(',')}}`;
}

export function buildCanonicalSigningString(parts: CanonicalSigningParts): string {
  return `${parts.timestampMs}\n${parts.nonce}\n${parts.sourceId}\n${parts.keyId}\n${parts.canonicalBody}`;
}

export function hasUsableKeyRing(keyRing: Readonly<Record<string, string>> | undefined): boolean {
  if (!keyRing) return false;
  return Object.values(keyRing).some((secret) => typeof secret === 'string' && secret.trim().length > 0);
}

/** Sign a payload using the canonical GhostGuard HMAC-SHA256 contract. */
export function signGhostGuardPayload(params: SignGhostGuardParams): SignedGhostGuardRequest {
  if (!params.secret || params.secret.trim().length === 0) {
    throw new Error('Cannot sign GhostGuard payload with empty secret');
  }
  if (!params.keyId.trim() || !params.sourceId.trim() || !NONCE_RE.test(params.nonce)) {
    throw new Error('Cannot sign GhostGuard payload with invalid auth metadata');
  }
  const canonicalBody = canonicalizeJson(params.payload);
  const preimage = buildCanonicalSigningString({
    timestampMs: params.timestampMs,
    nonce: params.nonce,
    sourceId: params.sourceId,
    keyId: params.keyId,
    canonicalBody,
  });
  const signature = createHmac('sha256', params.secret).update(preimage, 'utf8').digest('hex');
  return {
    canonicalBody,
    signature,
    headers: {
      'X-GhostGuard-Timestamp': String(params.timestampMs),
      'X-GhostGuard-Nonce': params.nonce,
      'X-GhostGuard-Source': params.sourceId,
      'X-GhostGuard-Key-Id': params.keyId,
      'X-GhostGuard-Signature': signature,
    },
  };
}

function singleHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createGhostGuardHmacVerifier(
  options: GhostGuardHmacAuthOptions,
): GhostGuardHmacVerifier {
  const maxSkewMs = Math.max(1, options.maxSkewMs ?? DEFAULT_MAX_SKEW_MS);
  const nonceTtlMs = Math.max(maxSkewMs * 2, options.nonceTtlMs ?? DEFAULT_NONCE_TTL_MS);
  const maxNonceEntries = Math.max(16, options.maxNonceEntries ?? DEFAULT_MAX_NONCE_ENTRIES);
  const nowEpochMs = options.nowEpochMs ?? (() => Date.now());
  const allowedSources = options.allowedSources?.length ? new Set(options.allowedSources) : undefined;
  const nonceCache = new Map<string, number>();

  const pruneExpired = (nowMs: number): void => {
    for (const [key, expiresAt] of nonceCache) {
      if (expiresAt <= nowMs) nonceCache.delete(key);
    }
    while (nonceCache.size >= maxNonceEntries) {
      const oldest = nonceCache.keys().next().value;
      if (oldest === undefined) break;
      nonceCache.delete(oldest);
    }
  };

  const verifyHeadersPreBody = (headers: IncomingHttpHeaders): GhostGuardHeaderCheckResult => {
    const tsRaw = singleHeader(headers, GHOST_GUARD_HEADER_TIMESTAMP);
    const nonce = singleHeader(headers, GHOST_GUARD_HEADER_NONCE);
    const sourceId = singleHeader(headers, GHOST_GUARD_HEADER_SOURCE);
    const keyId = singleHeader(headers, GHOST_GUARD_HEADER_KEY_ID);
    const signatureHex = singleHeader(headers, GHOST_GUARD_HEADER_SIGNATURE);

    if (!tsRaw || !nonce || !sourceId || !keyId || !signatureHex) {
      return { ok: false, error: 'Missing required GhostGuard authentication headers' };
    }
    if (!EPOCH_MS_RE.test(tsRaw)) return { ok: false, error: 'Invalid callback timestamp header' };
    if (!NONCE_RE.test(nonce)) return { ok: false, error: 'Invalid callback nonce header' };
    if (!HEX_64_RE.test(signatureHex)) return { ok: false, error: 'Invalid callback signature format' };
    if (allowedSources && !allowedSources.has(sourceId)) {
      return { ok: false, error: 'Callback source not in allowlist' };
    }
    const timestampMs = Number.parseInt(tsRaw, 10);
    if (!Number.isSafeInteger(timestampMs) || Math.abs(nowEpochMs() - timestampMs) > maxSkewMs) {
      return { ok: false, error: 'Callback timestamp outside permitted validity window' };
    }
    if (!Object.prototype.hasOwnProperty.call(options.keyRing, keyId)) {
      return { ok: false, error: 'Unknown callback signing key ID' };
    }
    const secret = options.keyRing[keyId];
    if (typeof secret !== 'string' || secret.trim().length === 0) {
      return { ok: false, error: 'Callback signing key is inactive or empty' };
    }
    return { ok: true, meta: { timestampMs, nonce, sourceId, keyId, signatureHex, secret } };
  };

  const verifyAndConsume = (headers: IncomingHttpHeaders, parsedBody: unknown): GhostGuardVerifyResult => {
    const headerCheck = verifyHeadersPreBody(headers);
    if (!headerCheck.ok) return headerCheck;
    const { timestampMs, nonce, sourceId, keyId, signatureHex, secret } = headerCheck.meta;

    const preimage = buildCanonicalSigningString({
      timestampMs, nonce, sourceId, keyId, canonicalBody: canonicalizeJson(parsedBody),
    });
    const expectedDigest = createHmac('sha256', secret).update(preimage, 'utf8').digest();
    const providedDigest = Buffer.from(signatureHex, 'hex');
    if (providedDigest.length !== expectedDigest.length || !timingSafeEqual(providedDigest, expectedDigest)) {
      return { ok: false, error: 'Invalid callback HMAC signature' };
    }

    // Synchronous check-and-insert prevents concurrent in-flight duplicate callbacks.
    const nowMs = nowEpochMs();
    pruneExpired(nowMs);
    const nonceKey = `${sourceId}:${nonce}`;
    const existingExpiry = nonceCache.get(nonceKey);
    if (existingExpiry !== undefined && existingExpiry > nowMs) {
      return { ok: false, error: 'Replayed or duplicate callback nonce', isReplay: true };
    }
    nonceCache.set(nonceKey, nowMs + nonceTtlMs);
    return { ok: true, keyId, sourceId, nonce };
  };

  return { verifyHeadersPreBody, verifyAndConsume, getCachedNonceCount: () => nonceCache.size };
}
