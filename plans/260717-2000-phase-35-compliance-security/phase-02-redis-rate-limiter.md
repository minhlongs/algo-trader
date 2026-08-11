--- title: "R2: Redis Distributed Rate Limiter" description: "Replace express-rate-limit with Redis sliding window, unify tier limits, MASTER=unlimited" status: complete priority: P1 effort: 4h branch: main tags: [rate-limit, redis, middleware] created: 2026-07-17 ---

# Phase 02: R2 — Redis Distributed Rate Limiter

## Context
- Scout report: `reports/scout-report.md` §2
- kongming advisory: Redis sliding window, tier-based, HTTP 429 + Retry-After, gateway-level

## Requirements

### Functional
1. Replace `express-rate-limit` in `api/server.ts:112-118` with `rateLimitMiddleware` from `forest/rate-limit`
2. Unify tier limits in `forest/rate-limit/redis-rate-limiter.ts` — single source of truth
3. MASTER tier = unlimited (no ceiling)
4. Add `Retry-After` header on 429 (seconds until window reset)
5. Wire rate limiter at gateway level in both API servers

### Tier Limits (corrected per kongming advisory)
| Tier | requestsPerMin | burstPerSec |
|------|---------------|-------------|
| FREE | 10 | 2 |
| PRO | 100 | 5 |
| ENTERPRISE | 1000 | 20 |
| MASTER | unlimited (0 = no limit) | 0 |

### Non-Functional
- Fail-open on Redis unavailability (current behavior preserved)
- Lua script idempotent (no re-define on every request)
- No `:any` types
- Zero `console.log`

## Architecture

```
Request → rateLimitMiddleware → checkRateLimit(userId, tier)
                                      ↓
                              Redis sorted set (sliding window)
                                      ↓
                              allowed? → set headers → next()
                                  ↓
                              denied? → 429 + Retry-After
```

## Files to Modify

| File | Change |
|------|--------|
| `src/forest/rate-limit/redis-rate-limiter.ts` | Unify tier limits per table above, MASTER=unlimited, remove `:any` in default helpers (lines 353, 358), add Retry-After in middleware |
| `src/api/server.ts` | Replace `express-rate-limit` (line 112-118) with `rateLimitMiddleware` from `@/forest/rate-limit` |
| `src/platform/api/server.ts` | Add `rateLimitMiddleware` in `setupMiddleware()` |

## Files to Create

None.

## Files to Delete

| File | Reason |
|------|--------|
| `src/platform/middleware/distributed-rate-limiter.ts` | Superseded by `forest/rate-limit/redis-rate-limiter.ts` — remove to eliminate dual implementations |

## Implementation Steps

### Step 1: Unify tier limits in forest/rate-limit
- File: `src/forest/rate-limit/redis-rate-limiter.ts`
- Replace `TIER_RATE_LIMITS` values per table above
- Add `MASTER = unlimited` logic: if tier === 'MASTER', skip Redis check, return `{ allowed: true, remaining: Infinity, resetAt: now+60s }`
- Remove `:any` from `defaultGetUserId` and `defaultGetTier` (use proper `Request` generic types)

### Step 2: Fix middleware :any casts
- File: `src/forest/rate-limit/redis-rate-limiter.ts`
- Lines 353-358: replace `req as any` with `req as Request & { user?: { id?: string; tier?: string } }`
- Remove `any` from default extractors — they accept `express.Request`
- Required imports already present (`express` types)

### Step 3: Add Retry-After header on 429
- File: `src/forest/rate-limit/redis-rate-limiter.ts` (in `rateLimitMiddleware`)
- On rejection: `res.setHeader('Retry-After', Math.ceil(...).toString())`
- Current code (line 333) already computes `retryAfter` but only uses it in the body — add the header

### Step 4: Replace express-rate-limit in api/server.ts
- File: `src/api/server.ts`
- Remove: `import rateLimit from 'express-rate-limit'` (line 9)
- Remove: `const limiter = rateLimit({...})` + `this.app.use('/api', limiter)` (lines 112-118)
- Add: `import { rateLimitMiddleware } from '@/forest/rate-limit'`
- Add: `this.app.use(rateLimitMiddleware())` — gateway-level, before routes
- Remove `express-rate-limit` from package.json dependencies (catpure in step 5)

### Step 5: Wire platform API server
- File: `src/platform/api/server.ts`
- Import `rateLimitMiddleware` from `../../forest/rate-limit`
- Add `this.app.use(rateLimitMiddleware())` in `setupMiddleware()` before route mounting
- Verify it works with `LicenseService` tier resolution (user context flows via Better Auth)

### Step 6: Clean up duplicate rate limiter
- Delete: `src/platform/middleware/distributed-rate-limiter.ts`
- Check: `src/platform/middleware/index.ts` — remove barrel export if present
- Check: any imports of `distributedRateLimiter` — `grep -rn 'distributedRateLimiter' src/`

## Todo List
- [ ] Update TIER_RATE_LIMITS to kongming-corrected values
- [ ] Implement MASTER=unlimited logic
- [ ] Remove :any casts (lines 353, 358)
- [ ] Add Retry-After header in middleware
- [ ] Replace express-rate-limit in api/server.ts
- [ ] Wire rateLimitMiddleware in platform/api/server.ts
- [ ] Remove express-rate-limit package dep
- [ ] Delete platform/middleware/distributed-rate-limiter.ts
- [ ] Update barrel exports
- [ ] Run `npx tsc --noEmit` → 0 errors
- [ ] Run `npm test` → all pass

## Success Criteria
1. `grep -rn 'express-rate-limit' src/` → 0 match
2. `grep -rn 'distributedRateLimiter' src/` → 0 match
3. MASTER tier receives no 429 responses
4. 429 response includes `Retry-After` header (integer seconds)
5. Rate limiter fails open on Redis unavailable (logged warning)
6. `grep -rn ':any' src/forest/rate-limit/` → 0 match
7. `grep -rn 'console\.\(log\|warn\|error\)' src/forest/rate-limit/` → 0 match

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| express-rate-limit removal breaks platform API | Medium | High | Replace in BOTH servers (api + platform) |
| MASTER unlimited causes Redis memory leak | Low | Low | MASTER path skips Redis entirely (no keys written) |
| Lua script re-define on every request | Medium | Medium | `if (typeof redis.rateLimit !== 'function')` guard already exists (line 89) |
| Tier limits too strict breaks legitimate users | Low | Medium | FREE=10/min is low but matches kongming spec; can bump if needed |

## Security Considerations
- Rate limiter key space: `ratelimit:{userId}` — tenant-isolated
- Lua script is atomic — no race conditions in sliding window
- Fail-open preserves availability (logged for monitoring)

## Rollback
- Revert `api/server.ts` to `express-rate-limit` (git revert)
- Restore `distributed-rate-limiter.ts` from git
- Rollback tier: L1 (no data loss, just middleware swap)
