# Phase 01: Audit Logging Unification

## Context Links
- Existing hash-chain: `src/seed/security/audit-log.ts:1` (456L, 28 tests pass)
- Audit middleware: `src/seed/security/audit-middleware.ts:1` (145L)
- Audit service: `src/platform/audit/audit-log-service.ts:1` (255L, 63 tests pass)
- Types: `src/seed/security/types.ts:1` (43L)
- IP hash: `src/seed/security/audit-ip-hash.ts:1` (37L)
- Migrations: `src/db/migrations/038-audit-log.ts` through `041-audit-hash-chain.ts`
- Existing test: `src/seed/security/__tests__/audit-log.test.ts`

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Unify three audit systems into single immutable hash-chained table. Ensure every API mutation (POST/PUT/DELETE) emits a structured audit entry via middleware. Fix middleware ordering gap on signal API server.

## Key Insights
1. Three audit systems exist but serve different layers — unification means single table, not single code path
2. Hash chain is already implemented in `src/seed/security/audit-log.ts` — extend, don't rebuild
3. `audit-middleware.ts` intercepts `res.json()` — works for Express, covers POST/PUT/DELETE automatically
4. Signal API server (`src/api/server.ts`) has NO audit middleware — must add

## Requirements
### Functional
- Every POST/PUT/DELETE to platform API produces one audit row with: actor, action, resource, result, ipHash, timestamp, tenantId
- Audit entries linked via SHA-256 hash chain (existing: `previous_hash` + HMAC)
- IP addresses hashed before storage (existing: `hashIpAddress()`)
- Sensitive response fields redacted from metadata (existing: `sanitizeBody()`)
- Dead letter queue for failed writes (existing: retry with exponential backoff)

### Non-Functional
- Audit write failure throws (fail-closed) — integrity > availability
- Audit middleware must not block request processing (fire-and-forget on success)
- Zero PII in audit metadata

## Architecture

### Data Flow (per request)
```
Request (POST/PUT/DELETE)
  -> authMiddleware (resolve identity)
  -> auditMiddleware (attach requestId, intercept res.json)
  -> rateLimitMiddleware (check quota)
  -> route handler (execute mutation)
  -> res.json() intercepted by auditMiddleware
     -> classify outcome (success/denied/failure)
     -> hashIpAddress(request IP)
     -> logAudit({ id, timestamp, actor, action, resource, result, metadata, ipHash, tenantId })
        -> compute hash chain (previous_hash + HMAC)
        -> INSERT into audit_log table
        -> on failure: enqueue dead letter, re-throw
```

### Middleware Ordering (platform server)
```
1. helmet (security headers)
2. cors (cross-origin)
3. authMiddleware (JWT identity)
4. auditMiddleware (request/response tracking)  <-- must be after auth
5. rateLimitMiddleware (quotas)
6. route handlers
7. errorHandler (catch-all)
```

## Related Code Files
### Files to modify
- `src/api/server.ts:97-102` — add audit middleware to signal API server
- `src/platform/api/server.ts:124-134` — verify middleware order (already correct)

### Files to verify (no changes expected)
- `src/seed/security/audit-log.ts` — hash chain logic (already complete)
- `src/seed/security/audit-middleware.ts` — Express middleware (already complete)
- `src/platform/audit/audit-log-service.ts` — service layer (already complete)
- `src/db/migrations/038-audit-log.ts` through `041-audit-hash-chain.ts` — schema (already applied)

## Implementation Steps
1. **Verify middleware order** on `src/platform/api/server.ts:124-134`
   - Confirm: auth -> audit -> rate-limit (already correct per existing code)
   - No changes needed if order is already correct

2. **Add audit middleware to signal API server**
   - File: `src/api/server.ts`
   - Import: `import { auditMiddleware } from '../seed/security/audit-middleware';`
   - Insert after `express.json()` (line 97), before route handlers (line 100)
   - This makes signal endpoints auditable too

3. **Verify hash chain integrity**
   - Run existing 28 audit-log tests: `npx vitest run src/seed/security/__tests__/audit-log.test.ts`
   - Verify migration 041 columns exist in DB schema

4. **Verify dead letter queue**
   - Existing code in `src/seed/security/audit-log.ts:74-158`
   - Verify retry logic and alert on persistent failure

## Todo List
- [ ] Verify middleware order on platform server
- [ ] Add audit middleware import to `src/api/server.ts`
- [ ] Insert audit middleware after `express.json()` on signal API server
- [ ] Run `npx tsc --noEmit` — 0 errors
- [ ] Run existing audit tests — all pass
- [ ] Run full test suite — no regressions

## Success Criteria
- [ ] Both API servers (platform + signal) have audit middleware in correct order
- [ ] POST/PUT/DELETE on signal API produce audit entries
- [ ] All 28 audit-log tests pass
- [ ] All 63 platform audit tests pass
- [ ] Zero TypeScript errors

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Audit middleware on signal server causes perf regression | Low | Medium | Fire-and-forget design; no DB write in request path |
| Middleware ordering conflict with existing signal auth | Low | High | Signal routes use inline auth (RaasGate), not middleware — no conflict |

## Security Considerations
- Audit middleware runs AFTER auth — actor identity available
- IP addresses hashed before storage — never plaintext
- Sensitive response fields redacted — no API keys or tokens in audit metadata
- Hash chain prevents retroactive tampering

## Next Steps
- Phase 02: Rate limiter canonical tier wiring (independent, can parallel)
- Phase 03: Zod schemas for audit entry validation (depends on Phase 01)
