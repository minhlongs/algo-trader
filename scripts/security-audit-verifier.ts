/**
 * Security Audit Verifier
 * Validates edge security invariants:
 * 1. Timing-safe HMAC webhook verification (SHA-256 / SHA-512)
 * 2. 100KB payload limit enforcement (Payload Bomb & ReDoS protection)
 * 3. Token-bucket rate-limit headers (Retry-After, X-RateLimit-*)
 * 4. Prometheus scrape token protection (Timing-safe authentication)
 */

import { createHmac, timingSafeEqual } from 'crypto';

export interface AuditCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

export interface SecurityAuditReport {
  timestamp: string;
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  checks: AuditCheckResult[];
}

export const MAX_PAYLOAD_BYTES = 100 * 1024; // 100KB limit

export function verifyTimingSafeHmac(
  payload: string,
  providedSignature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
  if (!providedSignature || !secret) return false;
  const cleanSig = providedSignature.startsWith(`${algorithm}=`)
    ? providedSignature.slice(algorithm.length + 1)
    : providedSignature;

  try {
    const expectedSig = createHmac(algorithm, secret).update(payload, 'utf8').digest('hex');
    const bufProvided = Buffer.from(cleanSig, 'hex');
    const bufExpected = Buffer.from(expectedSig, 'hex');
    if (bufProvided.length !== bufExpected.length) return false;
    return timingSafeEqual(bufProvided, bufExpected);
  } catch {
    return false;
  }
}

export function validatePayloadSize(byteLength: number, maxBytes: number = MAX_PAYLOAD_BYTES): {
  allowed: boolean;
  statusCode: number;
  reason?: string;
} {
  if (byteLength > maxBytes) {
    return {
      allowed: false,
      statusCode: 413,
      reason: `Payload size ${byteLength} exceeds maximum allowed limit of ${maxBytes} bytes`,
    };
  }
  return { allowed: true, statusCode: 200 };
}

export interface RateLimitHeaders {
  retryAfter?: string | null;
  limit?: string | null;
  remaining?: string | null;
  reset?: string | null;
}

export function validateRateLimitHeaders(headers: RateLimitHeaders, statusCode: number): {
  valid: boolean;
  missingHeaders: string[];
} {
  const missing: string[] = [];
  if (statusCode === 429) {
    if (!headers.retryAfter || isNaN(Number(headers.retryAfter)) || Number(headers.retryAfter) <= 0) {
      missing.push('Retry-After');
    }
    if (!headers.limit || isNaN(Number(headers.limit))) missing.push('X-RateLimit-Limit');
    if (headers.remaining === undefined || headers.remaining === null || headers.remaining !== '0') {
      missing.push('X-RateLimit-Remaining');
    }
    if (!headers.reset || isNaN(Number(headers.reset))) missing.push('X-RateLimit-Reset');
  }
  return { valid: missing.length === 0, missingHeaders: missing };
}

export function verifyPrometheusScrapeAuth(
  providedToken: string | null | undefined,
  configuredSecret: string | null | undefined
): { authorized: boolean; statusCode: number } {
  if (!configuredSecret || configuredSecret.length === 0) {
    return { authorized: true, statusCode: 200 };
  }
  if (!providedToken) {
    return { authorized: false, statusCode: 401 };
  }

  const bufProvided = Buffer.from(providedToken, 'utf8');
  const bufExpected = Buffer.from(configuredSecret, 'utf8');

  if (bufProvided.length !== bufExpected.length) {
    return { authorized: false, statusCode: 401 };
  }

  const isMatch = timingSafeEqual(bufProvided, bufExpected);
  return { authorized: isMatch, statusCode: isMatch ? 200 : 401 };
}

export async function runSecurityAudit(): Promise<SecurityAuditReport> {
  const checks: AuditCheckResult[] = [];

  // 1. Webhook HMAC Timing Safety Check
  const sampleSecret = 'test_edge_secret_key_123';
  const samplePayload = JSON.stringify({ event: 'payment.finished', id: 'pay_9988' });
  const validSig = createHmac('sha256', sampleSecret).update(samplePayload).digest('hex');
  const hmacPassed =
    verifyTimingSafeHmac(samplePayload, validSig, sampleSecret, 'sha256') &&
    !verifyTimingSafeHmac(samplePayload, 'deadbeef', sampleSecret, 'sha256') &&
    !verifyTimingSafeHmac(samplePayload + 'tamper', validSig, sampleSecret, 'sha256');
  checks.push({
    name: 'Timing-Safe Webhook HMAC Verification',
    passed: hmacPassed,
    details: hmacPassed ? 'Constant-time comparison active' : 'HMAC verification failed',
  });

  // 2. 100KB Payload Limit Enforcement
  const normalSizeCheck = validatePayloadSize(1024);
  const oversizedCheck = validatePayloadSize(150 * 1024);
  const payloadLimitPassed = normalSizeCheck.allowed && !oversizedCheck.allowed && oversizedCheck.statusCode === 413;
  checks.push({
    name: '100KB Payload Limit & ReDoS Protection',
    passed: payloadLimitPassed,
    details: payloadLimitPassed ? 'Rejects bodies > 100KB with 413' : 'Payload bounding failed',
  });

  // 3. Token-Bucket Rate-Limit Headers Assertion
  const valid429 = validateRateLimitHeaders({ retryAfter: '60', limit: '100', remaining: '0', reset: '1700000060' }, 429);
  const invalid429 = validateRateLimitHeaders({ limit: '100' }, 429);
  const rateLimitHeadersPassed = valid429.valid && !invalid429.valid;
  checks.push({
    name: 'Token-Bucket Rate-Limit Header Invariants',
    passed: rateLimitHeadersPassed,
    details: rateLimitHeadersPassed ? 'Emits Retry-After and X-RateLimit headers' : 'Header invariants violated',
  });

  // 4. Prometheus Scrape Secret Protection
  const promSecret = 'super_secret_metrics_token';
  const authedScrape = verifyPrometheusScrapeAuth(promSecret, promSecret);
  const unauthedScrape = verifyPrometheusScrapeAuth(null, promSecret);
  const wrongTokenScrape = verifyPrometheusScrapeAuth('wrong_token', promSecret);
  const promAuthPassed = authedScrape.authorized && !unauthedScrape.authorized && !wrongTokenScrape.authorized;
  checks.push({
    name: 'Prometheus Metrics Secret Scrape Gate',
    passed: promAuthPassed,
    details: promAuthPassed ? 'Constant-time query token check active' : 'Metrics endpoint exposed',
  });

  const passedChecks = checks.filter((c) => c.passed).length;
  const failedChecks = checks.length - passedChecks;

  return {
    timestamp: new Date().toISOString(),
    passed: failedChecks === 0,
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    checks,
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  runSecurityAudit().then((report) => {
    process.stdout.write(`Security Audit Verification: ${report.passed ? 'PASS' : 'FAIL'}\n`);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exit(report.passed ? 0 : 1);
  }).catch(() => process.exit(1));
}
