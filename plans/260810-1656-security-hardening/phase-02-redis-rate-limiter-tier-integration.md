# Phase 02: Redis Rate Limiter Tier Integration

## Context Links
- Research: `plans/reports/fullstack-developer-260321-1831-api-auth-rate-limiting.md`
- Existing: `src/forest/rate-limit/redis-rate-limiter.ts:1`
- Existing: `src/forest/rate-limit/index.ts:1`
- Tests: `src/forest/rate-limit/__tests__/redis-rate-limiter.test.ts`
- Redis client: `src/redis/index.ts`
- Tier config: Need canonical tier definition (check `src/seed/config/tiers.ts` or similar)

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Integrate existing Redis sliding-window rate limiter with tenant tier configuration (FREE, PRO, ENTERPRISE). Wire into API middleware chain with proper 429 responses and tenant isolation.

## Key Insights from Code Review
1. `redis-rate-limiter.ts` already implements sliding window with tier limits (FREE: 10/min, PRO: 100/min, ENTERPRISE: 1000/min, MASTER: unlimited)
2. Inline `TIER_RATE_LIMITS` object in `redis-rate-limiter.ts:16-30` — NOT single source of truth
3. No canonical tier config file exists at `src/seed/config/tiers.ts` (checked)
4. Rate limiter not yet wired into API middleware chain (`server.ts` only has routes, no middleware)
5. Tenant isolation: current key is `ratelimit:{userId}:{window}` — needs `tenant_id` scope
6. Graceful degradation: allows request + logs warning when Redis unavailable (fail-open for availability)
7. Audit hook emits rate limit events via `emitRateLimitAuditEvent`
8. Cluster mode supported via `REDIS_CLUSTER_ENABLED=true`

## Requirements

### Functional
- Rate limits configurable per tier: FREE, PRO, ENTERPRISE (uppercase enum)
- Per-tenant isolation: rate limit key includes `tenant_id`
- HTTP 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Tier resolution from authenticated request context (JWT/API key → user → tier)
- Audit logging on rate limit exceeded (already via `emitRateLimitAuditEvent`)
- **Canonical tier configuration at `src/seed/config/tiers.ts` (single source of truth for FREE, PRO, ENTERPRISE, MASTER limits)**
- **Per-tenant rate limit keys: `ratelimit:{tenant_id}:{endpoint}` (Redis hash tags for cluster co-location)**
- **Sliding window using Redis sorted sets with server time (`TIME` command) for window boundaries**
- **Fail-closed for authenticated routes**: Redis unavailable → reject with HTTP 503 + audit `rate_limit_unavailable`
- **Local token bucket fallback**: In-memory per-process token bucket (reduced quota: min(10, tier_limit)) when Redis circuit breaker open
- **Circuit breaker**: 3 consecutive Redis failures → 30s half-open → if success, close; if fail, reopen

### Non-Functional
- **Fail-closed**: Redis unavailable → reject authenticated requests with HTTP 503; health checks pass
- **Local token bucket fallback** in degraded mode (reduced quota)
- <2ms p99 latency for rate limit check
- Redis Cluster support for horizontal scaling
- Zero `any` types

## Architecture

### Data Flow
```
Request → Auth Middleware (resolves user + tier)
  → Rate Limit Middleware
    → Redis ZSET key: "ratelimit:{tenant_id}:{endpoint}:{window}"
    → ZREMRANGEBYSCORE (remove expired)
    → ZCARD (count current window)
    → If count >= limit: return 429
    → Else: ZADD (timestamp, unique_id), EXPIRE
    → Set response headers
```

### Tier Configuration (Single Source of Truth)
```typescript
// src/seed/config/tiers.ts
export const TIER_RATE_LIMITS = {
  FREE: { requests: 10, windowMs: 60_000, burst: 2 },
  PRO: { requests: 100, windowMs: 60_000, burst: 10 },
  ENTERPRISE: { requests: 1000, windowMs: 60_000, burst: 50 },
  MASTER: { requests: 0, windowMs: 60_000, burst: 0 }, // 0 = unlimited
} as const;

export type Tier = keyof typeof TIER_RATE_LIMITS;
```

### Circuit Breaker + Local Fallback
```typescript
// Local token bucket (per-process)
interface LocalTokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number; // min(10, tier.limit)
  refillRate: number; // tokens per ms
}

enum CircuitState { CLOSED, HALF_OPEN, OPEN }
```

## Related Code Files

### Modify
1. `src/forest/rate-limit/redis-rate-limiter.ts` — Import tier config, add circuit breaker + local fallback, tenant-scoped keys with hash tags
2. `src/forest/rate-limit/index.ts` — Export updated `RedisRateLimiter`, `TIER_RATE_LIMITS` (re-export from seed)
3. `src/api/middleware/rate-limit-middleware.ts` (create or update) —
   - Wire rate limiter into Express middleware chain
   - Extract `tenant_id` from authenticated request
   - Handle missing tier gracefully (default FREE)

### Create
3. `src/seed/config/tiers.ts` — Canonical tier definitions
4. `src/api/middleware/require-tenant.ts` — Middleware to ensure tenant context exists

### Verify Integration
5. `src/api/server.ts` — Confirm middleware order: CORS → Auth → RateLimit → Routes
6. `src/api/routes/audit-routes.ts` — Verify audit logging of rate limit events works

## Implementation Steps

1. **Create canonical tier config**: `src/seed/config/tiers.ts` with `TIER_RATE_LIMITS` and `Tier` type
2. **Update redis-rate-limiter.ts**: Import from `@/seed/config/tiers`, remove inline `TIER_RATE_LIMITS`
3. **Add tenant_id to rate limit key**: Modify key generation to include tenant scope with hash tags
4. **Create/review API middleware**: Ensure `rateLimitMiddleware` wired in `server.ts` after auth
5. **Add tenant context middleware**: Extract `tenant_id` from auth (JWT/API key) → attach to request
6. **Implement fail-closed with local fallback**:
   - Add circuit breaker state machine (closed/half-open/open)
   - Add in-memory token bucket per process (reduced quota: min(10, tier_limit))
   - On Redis failure: circuit breaker opens → serve from local token bucket
   - On local bucket exhausted: return 503 with audit event `rate_limit_unavailable`
   - Background health check: ping Redis every 10s → half-open → success closes circuit
7. **Verify 429 response**: Test `Retry-After`, `X-RateLimit-*` headers present
8. **Test Redis Cluster mode**: Set `REDIS_CLUSTER_ENABLED=true`, verify health check
9. **Write tests**: Tier limits, tenant isolation, circuit breaker, local fallback, header correctness

## Todo List
- [ ] Create src/seed/config/tiers.ts with canonical tier definitions
- [ ] Update redis-rate-limiter.ts to import tier config
- [ ] Modify rate limit key to include tenant_id with hash tags
- [ ] Create/wire rate-limit middleware in API server
- [ ] Add tenant context extraction middleware
- [ ] Implement circuit breaker + local token bucket fallback
- [ ] Verify 429 response headers
- [ ] Test Redis Cluster mode
- [ ] Write unit tests (tiers, isolation, circuit breaker, local fallback)
- [ ] Write integration test (full middleware chain)

## Success Criteria
- Requests from FREE tier blocked at 11th request/min (429)
- Requests from PRO tier blocked at 101st request/min (429)
- Requests from ENTERPRISE tier blocked at 1001st request/min (429)
- Tenant A requests don't count against Tenant B's limit
- **Redis down → authenticated requests return 503 + audit `rate_limit_unavailable`; local token bucket serves reduced quota**
- **Circuit breaker transitions logged and audited**
- 429 response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- All existing tests pass + new tier/isolation tests pass

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tier resolution returns wrong tier | Medium | High | Unit test tier extraction from auth; integration test per tier |
| Tenant ID missing from request | Medium | Medium | Default to IP-based limiting + audit log missing tenant |
| Redis Cluster key distribution | Low | Medium | Use hash tags `{tenant_id}` for co-location |
| Clock skew between app/Redis | Low | Low | Use Redis server time via `TIME` command for window boundaries |
| Circuit breaker opens too aggressively | Medium | High | Configurable failure threshold; alert on open |
| Local token bucket state not shared across processes | Medium | Medium | Document per-process limitation; acceptable for k8s pod scaling |

## Security Considerations
- Rate limit keys scoped to tenant — no cross-tenant leakage
- IP-based fallback when tenant unknown (prevents anonymous abuse)
- Audit log captures rate limit events with tenant_id, IP hash, endpoint
- No sensitive data in rate limit metadata

## Next Steps
- Phase 03: AES-256 Encryption at Rest (independent)
- Phase 04: Integration tests covering audit + rate limit + encryption