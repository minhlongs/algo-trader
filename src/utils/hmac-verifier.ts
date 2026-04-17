/**
 * HMAC-SHA256 Verifier
 * Timing-safe HMAC verification with replay protection via timestamp window.
 * Used by signal-ingest-routes and any future webhook endpoints that share the same scheme.
 *
 * Scheme:
 *   Header X-Signature-256: sha256=<hex>  — HMAC-SHA256(secret, rawBody)
 *   Header X-Timestamp: <unix_seconds>    — reject if |now - ts| > maxSkewMs
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Compute HMAC-SHA256 of payload using secret.
 * Returns lowercase hex digest.
 */
export function computeHmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * Verify HMAC signature and timestamp window.
 *
 * @param rawBody     - Raw request body string (must match what daemon signed)
 * @param signature   - Value of X-Signature-256 header (format: "sha256=<hex>")
 * @param secret      - Shared HMAC secret (QWEN_INGEST_HMAC_SECRET)
 * @param tsSeconds   - Value of X-Timestamp header parsed as integer (unix seconds)
 * @param maxSkewMs   - Maximum allowed clock skew in milliseconds (default 300_000 = 5 min)
 * @returns true if signature matches AND timestamp is within window
 */
export function verifyHmacSha256(
  rawBody: string,
  signature: string,
  secret: string,
  tsSeconds: number,
  maxSkewMs: number = 300_000,
): boolean {
  // Validate timestamp window first (cheap check before crypto)
  const nowMs = Date.now();
  const tsDeltaMs = Math.abs(nowMs - tsSeconds * 1000);
  if (tsDeltaMs > maxSkewMs) {
    return false;
  }

  // Signature must start with "sha256="
  if (!signature.startsWith('sha256=')) {
    return false;
  }

  const provided = signature.slice(7); // strip "sha256=" prefix
  const expected = computeHmacSha256(secret, rawBody);

  // Timing-safe comparison to prevent timing attacks
  try {
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    // If lengths differ, buffers are not equal — avoid throwing from timingSafeEqual
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
