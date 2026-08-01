# Phase 4: Fix Hardcoded endpoint in Rate Limiter Audit

**Agent:** fullstack-developer
**Depends on:** (none — independent)

## Files to modify

| File | Change |
|------|--------|
| src/forest/rate-limit/redis-rate-limiter.ts | Pass endpoint from middleware to checkRateLimit |

## Context

In redis-rate-limiter.ts line 164, endpoint is hardcoded as empty string when emitting the rate-limit audit event. The RateLimitAuditMetadata interface requires endpoint, but checkRateLimit(userId, tier) does not receive it. The rateLimitMiddleware has access to req.path but currently does not pass it through.

## Decision: Option A

Extend checkRateLimit with an optional endpoint parameter. Preferred because:
- RL-001 requires enriched metadata: { tenantId, endpoint, tier, remainingMs, retryAfter }
- The middleware already has req.path available
- Adding an optional parameter is backward-compatible (defaults to 'unknown')

## Steps

1. In redis-rate-limiter.ts, update checkRateLimit signature (line 118) to add optional endpoint parameter
2. In the 429 audit event call (line 161), use the parameter instead of hardcoded empty string
3. In rateLimitMiddleware (line 341), pass req.path as the endpoint argument
