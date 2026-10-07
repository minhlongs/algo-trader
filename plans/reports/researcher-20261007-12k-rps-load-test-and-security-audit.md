# Research & Architecture: 12k RPS Edge Load Test Suite & Security Audit Verification

## Executive Summary
Evaluation and test architecture to validate 12,000 requests/second (RPS) sustained throughput against Cloudflare Workers edge proxy, 12 Durable Object (DO) shards, and token-bucket rate limiters, paired with edge-native security audit verification.

## Source Credibility & Evidence Matrix
- **Cloudflare DO Performance Docs & Engine Benchmarks** (Authoritative): Single DO handles ~1,000–2,000 req/s on isolated V8 thread; 12 shards provide 12,000–24,000 req/s aggregate ceiling.
- **k6 Distributed Execution Engine v0.50+** (Industry Standard): Execution via hybrid multi-VU ramping-arrival-rate executor provides deterministic RPS independent of edge latency fluctuations.
- **OWASP API Security Top 10 (2023/2026)** (Standards Body): Target edge risks: Broken Object Level Auth (BOLA), Rate Limit Bypass, and Unrestricted Resource Consumption.

## Trade-off Matrix: Load & Security Architectures

| Dimension | Option A: Distributed k6 on K8s / Cloud (Recommended) | Option B: Cloudflare Distributed Workers as Loaders | Option C: Artillery.io / Vegeta Local |
| :--- | :--- | :--- | :--- |
| **Precision** | High: Constant arrival rate engine, microsecond telemetry | Medium: Sub-request concurrency limits skew latency metrics | Low: Single machine port/socket exhaustion at >5k RPS |
| **Edge Fidelity** | High: Generates real traffic from 4 geographical regions | Low: Internal Cloudflare network bypasses CDN edge layers | Low: Local ISP loopback/throttling artifacts |
| **DO Shard Audit** | Direct hash ring distribution verification via k6 tags | Indirect: Obscured by edge worker co-location | High: Manual instrumentation required |
| **Cost & Ops** | Low: Ephemeral Spot instances or k6 OSS runner | Zero infra, high Workers request invocation billing | Zero cost, but false bottleneck reporting |

*Ranking: 1. Distributed k6 on K8s/Cloud | 2. Cloudflare Distributed Workers | 3. Local Artillery/Vegeta*

## 12k RPS k6 Scenario Architecture
Target total load = 12,000 RPS distributed across 3 workload profiles:
1. **Edge Cache Reads (`GET /api/v1/strategies/list`, `/health`)**: 8,000 RPS (66.7%). Handled by Cloudflare Edge Cache API (`caches.default`) & L1 memory. p99 SLA: <15ms.
2. **DO Shard Executions (`POST /api/v1/strategies/execute`)**: 3,000 RPS (25.0%). Dispatched across 12 DO shards (`SHARD_0`..`SHARD_11`) via consistent hash ring (~250 RPS/shard). p99 SLA: <45ms.
3. **Throttled Mutation / Auth Burst (`POST /api/auth/login`)**: 1,000 RPS (8.3%). Validates token bucket exhaustion and HTTP 429 emission.

```javascript
// k6 scenario snippet outline
export const options = {
  scenarios: {
    edge_cached_reads: {
      executor: 'ramping-arrival-rate',
      startRate: 1000,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { target: 4000, duration: '1m' },
        { target: 8000, duration: '4m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'testCachedReads',
    },
    do_shard_execution: {
      executor: 'ramping-arrival-rate',
      startRate: 500,
      timeUnit: '1s',
      preAllocatedVUs: 300,
      maxVUs: 1500,
      stages: [
        { target: 1500, duration: '1m' },
        { target: 3000, duration: '4m' },
        { target: 0, duration: '30s' },
      ],
      exec: 'testStrategyExecute',
    },
    rate_limiter_burst: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 100,
      maxVUs: 400,
      exec: 'testRateLimiterBurst',
    },
  },
  thresholds: {
    'http_req_duration{scenario:edge_cached_reads}': ['p(99)<15'],
    'http_req_duration{scenario:do_shard_execution}': ['p(99)<45'],
    'http_req_failed{scenario:edge_cached_reads}': ['rate<0.001'],
    'http_req_failed{scenario:do_shard_execution}': ['rate<0.005'],
    'http_req_duration{scenario:rate_limiter_burst}': ['p(95)<30'],
  },
};
```

## Token Bucket & Edge Caching Invariants
- **Token Bucket Invariant**: Per-client tier limit (Free: 100 req/min, Pro: 1,000 req/min, Tier-3: 10,000 req/min). Leaky bucket state evaluated in KV/DO memory with sliding window.
- **Header Invariants**: Every throttled response MUST return: `HTTP 429 Too Many Requests`, `Retry-After: <seconds>`, `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset`.
- **Edge Cache Invariant**: Immutable responses return `CF-Cache-Status: HIT` on subsequent requests; cache bypass occurs strictly when `Authorization` or mutation headers present.
- **DO Shard Balance Invariant**: Hash ring distributes across 12 shards with virtual node count $V=100$. Shard traffic skew variance $\sigma^2 \le 15\%$ across `SHARD_0`..`SHARD_11`.

## Security Audit Verification Vectors
1. **Timing Attack Resistance**: Webhook HMAC signatures (`NOWPayments`, `Telegram`) must use `crypto.timingSafeEqual` over Uint8Array buffers.
2. **DO Direct Access Prevention**: Direct external calls to DO classes forbidden; worker ingress validates secret binding / internal signature token.
3. **ReDoS & Payload Bomb Defense**: JSON body parsing strictly size-capped at 100KB prior to deserialization.
4. **CORS Preflight & Security Headers**: Strict enforcement of `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, and origin validation on all routes.
5. **Prometheus Scrape Protection**: `GET /metrics` must enforce constant-time bearer token check via query parameter `?token=`.

## CI Gate Checks & Adoption Risk

### Adoption Risk
- **DO Single-Thread Saturation**: If a single strategy key receives >1.5k RPS hot-spotting, consistent hashing without sub-sharding causes queue latency spikes.
- **KV Write Limits**: KV rate limiting fails if writing tokens to KV on every request (1 req/sec write limit per key); must use DO in-memory state or Cloudflare Rate Limiting API.

### CI Automated Gates (Makefile / GitHub Actions)
- `gate-1-smoke`: 100 RPS for 30s — verify 100% 200/429 correctness and header invariants.
- `gate-2-peak`: 12,000 RPS for 3m — assert p99 latency (<45ms DO, <15ms cache) and error rate (<0.1%).
- `gate-3-security`: Fuzzing runner injecting 2MB payload bombs, malformed HMACs, and timing skew probes (assert zero 500s, zero information leaks).

## Concrete Recommendation
1. Deploy **k6 Distributed Suite** using `ramping-arrival-rate` executor for deterministic 12k RPS load generation.
2. Implement **In-Memory Sliding Token Bucket inside StrategyShard DOs** for precise per-tenant rate gating, eliminating KV write bottlenecks.
3. Enforce **3-Tier CI Performance & Security Ratchet** blocking PRs that exceed p99 latency thresholds or fail rate limit header conformance.

## Limitations
- Cloudflare Enterprise DDoS layer auto-mitigation can throttle simulated external load agents unless IP allowlisting is configured on Cloudflare WAF.
- Research excludes VPS backend cold-starts as VPS origin is bypassed during pure edge-worker testing.

## Unresolved Questions
1. Is Cloudflare WAF configured with custom rate limiting rules that supersede Worker-level token bucket headers?
2. Are all 12 DO shards deployed across distinct physical colos, or does Cloudflare DO placement engine cluster them based on initial creator location?
