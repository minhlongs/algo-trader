import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import {
  calculatePercentile,
  computeScenarioMetrics,
  generateSyntheticSamples,
  run12kLoadTest,
} from '../../../scripts/load-test-12k-rps';
import {
  verifyTimingSafeHmac,
  validatePayloadSize,
  validateRateLimitHeaders,
  verifyPrometheusScrapeAuth,
  runSecurityAudit,
  MAX_PAYLOAD_BYTES,
} from '../../../scripts/security-audit-verifier';

describe('Edge Load Test Runner (12k RPS)', () => {
  it('calculatePercentile computes accurate percentiles on distributions', () => {
    expect(calculatePercentile([], 99)).toBe(0);
    expect(calculatePercentile([10], 99)).toBe(10);
    const series = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(calculatePercentile(series, 50)).toBe(50.5);
    expect(calculatePercentile(series, 99)).toBe(99.01);
  });

  it('computeScenarioMetrics calculates SLAs and throughput accurately', () => {
    const samples = [
      { latencyMs: 5, statusCode: 200 },
      { latencyMs: 8, statusCode: 200 },
      { latencyMs: 14, statusCode: 200 },
      { latencyMs: 50, statusCode: 500 },
    ];
    const metrics = computeScenarioMetrics('edge_cached_reads', samples, 1000, 4, 15);
    expect(metrics.totalRequests).toBe(4);
    expect(metrics.successCount).toBe(3);
    expect(metrics.errorCount).toBe(1);
    expect(metrics.achievedRps).toBe(4);
    expect(metrics.p99SlaPass).toBe(false); // 50ms > 15ms max
  });

  it('generateSyntheticSamples generates correct sample counts and shard assignments', () => {
    const cacheSamples = generateSyntheticSamples('edge_cached_reads', 50);
    expect(cacheSamples).toHaveLength(50);
    expect(cacheSamples.every((s) => s.statusCode === 200)).toBe(true);

    const doSamples = generateSyntheticSamples('do_shard_execution', 120, 12);
    expect(doSamples).toHaveLength(120);
    const shards = new Set(doSamples.map((s) => s.shardId));
    expect(shards.size).toBe(12);

    const burstSamples = generateSyntheticSamples('rate_limiter_burst', 150);
    expect(burstSamples.filter((s) => s.statusCode === 429).length).toBe(50);
  });

  it('run12kLoadTest asserts 12k RPS p99 SLAs (<15ms cache, <45ms DO) and shard distribution', async () => {
    const report = await run12kLoadTest({ durationSeconds: 1, targetRps: 12_000, shardsCount: 12 });
    expect(report.totalRps).toBe(12_000);
    expect(report.overallSuccess).toBe(true);
    expect(report.scenarios.edge_cached_reads.p99Ms).toBeLessThanOrEqual(15);
    expect(report.scenarios.do_shard_execution.p99Ms).toBeLessThanOrEqual(45);
    expect(report.scenarios.rate_limiter_burst.rateLimitedCount).toBeGreaterThan(0);
    expect(Object.keys(report.shardDistribution)).toHaveLength(12);
  });

  it('run12kLoadTest detects SLA violations with custom latencies', async () => {
    const report = await run12kLoadTest({
      durationSeconds: 1,
      targetRps: 12_000,
      customLatencies: {
        edge_cached_reads: [100, 200],
        do_shard_execution: [10, 20],
        rate_limiter_burst: [5, 5],
      },
    });
    expect(report.scenarios.edge_cached_reads.p99SlaPass).toBe(false);
    expect(report.overallSuccess).toBe(false);
  });
});

describe('Edge Security Audit Verifier', () => {
  it('verifyTimingSafeHmac validates valid HMACs and rejects tamper / bad signatures', () => {
    const secret = 'super_secret_test_key_xyz';
    const body = '{"user_id":"u_123","action":"trade"}';
    const computed = createHmac('sha256', secret).update(body).digest('hex');
    const sha256Sig = `sha256=${computed}`;

    expect(verifyTimingSafeHmac(body, '', secret)).toBe(false);
    expect(verifyTimingSafeHmac(body, 'invalid_hex', secret)).toBe(false);
    expect(verifyTimingSafeHmac(body, sha256Sig, 'wrong_secret')).toBe(false);
    expect(verifyTimingSafeHmac(body + 'tampered', sha256Sig, secret)).toBe(false);
    expect(verifyTimingSafeHmac(body, sha256Sig, secret, 'sha256')).toBe(true);
  });

  it('validatePayloadSize enforces 100KB payload limit', () => {
    expect(validatePayloadSize(1024).allowed).toBe(true);
    expect(validatePayloadSize(MAX_PAYLOAD_BYTES).allowed).toBe(true);
    const exceeded = validatePayloadSize(MAX_PAYLOAD_BYTES + 1);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.statusCode).toBe(413);
  });

  it('validateRateLimitHeaders enforces standard token bucket headers on 429', () => {
    const valid = validateRateLimitHeaders({
      retryAfter: '30',
      limit: '1000',
      remaining: '0',
      reset: '1700000030',
    }, 429);
    expect(valid.valid).toBe(true);
    expect(valid.missingHeaders).toHaveLength(0);

    const invalid = validateRateLimitHeaders({ limit: '1000', remaining: '5' }, 429);
    expect(invalid.valid).toBe(false);
    expect(invalid.missingHeaders).toContain('Retry-After');
    expect(invalid.missingHeaders).toContain('X-RateLimit-Remaining');
    expect(invalid.missingHeaders).toContain('X-RateLimit-Reset');

    const non429 = validateRateLimitHeaders({}, 200);
    expect(non429.valid).toBe(true);
  });

  it('verifyPrometheusScrapeAuth gates metrics endpoint with constant-time token check', () => {
    const secret = 'scrape_secret_token_99';
    expect(verifyPrometheusScrapeAuth(secret, secret)).toEqual({ authorized: true, statusCode: 200 });
    expect(verifyPrometheusScrapeAuth(null, secret)).toEqual({ authorized: false, statusCode: 401 });
    expect(verifyPrometheusScrapeAuth('wrong_token', secret)).toEqual({ authorized: false, statusCode: 401 });
    expect(verifyPrometheusScrapeAuth('short', secret)).toEqual({ authorized: false, statusCode: 401 });
    expect(verifyPrometheusScrapeAuth(null, '')).toEqual({ authorized: true, statusCode: 200 });
  });

  it('runSecurityAudit completes end-to-end security verification suite with 100% pass', async () => {
    const auditReport = await runSecurityAudit();
    expect(auditReport.passed).toBe(true);
    expect(auditReport.failedChecks).toBe(0);
    expect(auditReport.totalChecks).toBeGreaterThanOrEqual(4);
  });
});
