# Phase 02: Rate Limiter Canonical Tier Wiring

## Context Links
- Rate limiter tier config: `src/forest/rate-limit/tier-config.ts:61L` (23 tests pass)
- Sliding window core: `src/forest/rate-limit/sliding-window.ts:195L`
- Express middleware: `src/forest/rate-limit/express-middleware.ts`
- Canonical tiers: `src/seed/config/tiers.ts:122L`
- Canonical tier limits: `src/seed/config/tiers.ts:91-97` (TIER_RATE_LIMITS map)
- Rate limit tests: `src/forest/rate-limit/__tests__/redis-rate-limiter.test.ts`
- Platform server: `src/platform/api/server.ts:134-136` (rate limit mounted at `/api`)

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Remove duplicated `TIER_RATE_LIMITS` and `DEFAULT_TIER_LIMITS` from `tier-config.ts`, replace with imports from canonical `seed/config/tiers.ts`. Fix default tier mismatch (60/min vs canonical FREE=10/min).

## Key Insights

### CRITICAL: Default Tier Limit Mismatch Found

| Source | Default (unrecognized tier) | FREE tier |
|--------|---------------------------|-----------|
| `seed/config/tiers.ts:99` (canonical) | `TIER_RATE_LIMITS.FREE` = **10/min, 2/sec** | 10/min, 2/sec |
| `forest/rate-limit/tier-config.ts:48-51` (limiter) | `requestsPerMin: 60, burstPerSec: 3` | 10/min, 2/sec |

**Impact**: Any request with an unrecognized tier string gets **60 req/min** in rate limiter but **10 req/min** in canonical config. This is a security gap — unknown tiers should fail-safe to FREE (10/min), not open up to 60/min.

### Modular Architecture (Post-Refactor)
Rate limiter is split into 4 modules:
- `tier-config.ts` — tier definitions (duplicated from canonical)
- `sliding-window.ts` — Redis sorted-set algorithm
- `express-middleware.ts` — Express middleware wrapper
- `key-validation.ts` — Redis key prefix validation

Fix target: `tier-config.ts` only (lines 1-61).

## Requirements
### Functional
- `tier-config.ts` imports `TIER_RATE_LIMITS` and `getTierRateLimits` from `seed/config/tiers.ts`
- Remove local `TIER_RATE_LIMITS`, `DEFAULT_TIER_LIMITS`, and `resolveLimits()` from `tier-config.ts`
- Re-export from canonical source for backward compatibility (existing consumers import from `tier-config.ts`)
- Default for unrecognized tiers: FREE limits (10/min, 2/sec) — NOT 60/min

### Non-Functional
- No new Redis keys or data structures
- Sliding window algorithm unchanged
- Graceful degradation on Redis failure preserved
- All 23 rate limiter tests pass

## Architecture

### Before (duplicated)
```
tier-config.ts                    seed/config/tiers.ts
  TIER_RATE_LIMITS = {              TIER_RATE_LIMITS = {
    FREE: {10, 2},                    FREE: {10, 2},
    PRO: {100, 5},                    PRO: {100, 5},
    ENTERPRISE: {1000, 20},           ENTERPRISE: {1000, 20},
    MASTER: {0, 0},                   MASTER: {0, 0},
  }                                 }
  DEFAULT = {60, 3}  <-- MISMATCH   DEFAULT = FREE {10, 2}
  resolveLimits()                   getTierRateLimits()
```

### After (canonical)
```
tier-config.ts                    seed/config/tiers.ts
  import { getTierRateLimits }  ->   TIER_RATE_LIMITS = { ... }
  re-export TIER_RATE_LIMITS    <-   DEFAULT_TIER_LIMITS = FREE
  re-export getTierRateLimits   <-   getTierRateLimits()
```

## Related Code Files
### Files to modify
- `src/forest/rate-limit/tier-config.ts:1-61` — replace local definitions with canonical imports + re-exports

### Files to verify (no changes)
- `src/seed/config/tiers.ts` — canonical source
- `src/forest/rate-limit/sliding-window.ts` — imports from `tier-config.ts` (unchanged)
- `src/forest/rate-limit/__tests__/redis-rate-limiter.test.ts` — existing 23 tests

## Implementation Steps
1. **Replace `tier-config.ts` contents**
   - File: `src/forest/rate-limit/tier-config.ts`
   - Remove: local `TierRateLimits` interface, `TIER_RATE_LIMITS`, `DEFAULT_TIER_LIMITS`, `resolveLimits()`
   - Add: `import { TIER_RATE_LIMITS, DEFAULT_TIER_LIMITS, getTierRateLimits, type TierLabel } from '../../seed/config/tiers';`
   - Re-export everything for backward compatibility:
     ```typescript
     export { TIER_RATE_LIMITS, DEFAULT_TIER_LIMITS, getTierRateLimits, type TierLabel };
     export type TierRateLimits = { requestsPerMin: number; burstPerSec: number };
     ```
   - Keep `resolveLimits` as alias: `export const resolveLimits = getTierRateLimits;`

2. **Verify `sliding-window.ts` import still works**
   - `sliding-window.ts:16` imports `resolveLimits` from `./tier-config`
   - After change, it will resolve to the canonical `getTierRateLimits` via re-export
   - No code changes needed in `sliding-window.ts`

3. **Run tests**
   - Rate limiter tests (23): must all pass
   - Full suite: no regressions

4. **Verify default tier fix**
   - Before: unrecognized tier -> 60/min (too permissive)
   - After: unrecognized tier -> 10/min (fail-safe to FREE)

## Todo List
- [ ] Read current `tier-config.ts` to confirm exact contents
- [ ] Replace local definitions with canonical imports
- [ ] Add backward-compatible re-exports
- [ ] Add `resolveLimits` alias for `getTierRateLimits`
- [ ] Verify `sliding-window.ts` import chain
- [ ] Run `npx tsc --noEmit` — 0 errors
- [ ] Run rate limiter tests — all 23 pass
- [ ] Run full test suite — no regressions

## Success Criteria
- [ ] `tier-config.ts` has no local `TIER_RATE_LIMITS` or `DEFAULT_TIER_LIMITS` definitions
- [ ] All tier lookups resolve to `seed/config/tiers.ts`
- [ ] Default tier is FREE (10/min) not 60/min — security gap closed
- [ ] `resolveLimits` alias preserved for backward compatibility
- [ ] All 23 rate limiter tests pass
- [ ] Zero TypeScript errors

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Re-export breaks existing consumers | Low | Medium | Re-export preserves same names; `resolveLimits` alias kept |
| Default tier change (60->10) breaks legitimate unknown-tier requests | Low | High | Unknown tiers should not exist; 10/min is safer default |
| `TierRateLimits` interface mismatch between modules | Low | Low | Both define identical `{ requestsPerMin: number; burstPerSec: number }` |

## Security Considerations
- **FIXED**: Unrecognized tier strings now fail-safe to FREE (10/min) instead of 60/min
- Canonical source prevents future tier drift between rate limiter and other consumers
- Admin endpoint stricter limits: YAGNI for this phase (future work)

## Next Steps
- Phase 03: Zod schemas for audit entries (depends on Phase 01)
- Phase 04: E2E integration test (depends on Phase 01 + 02)
