# Phase 04: Integration Test — Audit Trail E2E

## Context Links
- Audit log: `src/seed/security/audit-log.ts` (hash chain, PostgreSQL)
- Audit service: `src/platform/audit/audit-log-service.ts` (query, export)
- Rate limiter: `src/forest/rate-limit/redis-rate-limiter.ts` (sliding window)
- Test framework: Vitest v4.1.2, `tests/integration/` directory
- Mock Redis: `ioredis-mock` v8.9.0 (used in existing rate limiter tests)
- DB mock: existing pattern in `src/db/__tests__/` 

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: End-to-end integration test verifying: request -> audit middleware -> DB -> query. Also test rate limiting enforcement and combined audit+rate-limit behavior.

## Key Insights
1. E2E tests need both PostgreSQL (audit storage) and Redis (rate limit state) — use mocks for unit-level, real for integration
2. Express `supertest` not installed — test via direct middleware invocation (faster, no HTTP overhead)
3. Existing test patterns use `vi.mock()` for module isolation — follow same pattern
4. Test should verify: (a) audit entry created, (b) entry queryable, (c) rate limit enforced, (d) combined behavior

## Requirements
### Functional
- Test: POST request -> audit middleware -> audit entry in DB -> GET returns entry
- Test: rate limit exceeded -> HTTP 429 + audit entry for denial
- Test: audit entry has correct fields (actor, action, result, ipHash)
- Test: invalid audit entry rejected by Zod schema
- Test: hash chain integrity (entry N's previous_hash = entry N-1's hash)

### Non-Functional
- Test runs without external services (mocked Redis + PostgreSQL)
- Test file under 200 lines
- Test completes in < 5 seconds

## Architecture

### Test Structure
```
tests/integration/audit-trail-e2e.test.ts
  describe('Audit Trail E2E')
    it('creates audit entry for POST mutation')
    it('creates audit entry for DELETE mutation')
    it('audit entry has correct fields')
    it('audit entry is queryable by tenant')
    it('hash chain links entries sequentially')
    it('rate limit rejection produces audit entry')
    it('invalid audit entry is rejected by Zod schema')
```

### Mock Strategy
- PostgreSQL: Mock `query()` and `transaction()` from `src/db/postgres-client.ts`
- Redis: Use `ioredis-mock` (already a devDependency)
- Express: Create minimal Express app with middleware chain for testing

## Related Code Files
### Files to create
- `tests/integration/audit-trail-e2e.test.ts`

### Files to read (not modify)
- `src/seed/security/audit-log.ts` — `logAudit()`, `getAuditTrail()`
- `src/seed/security/audit-middleware.ts` — `auditMiddleware()`
- `src/forest/rate-limit/redis-rate-limiter.ts` — `rateLimitMiddleware()`
- `src/db/postgres-client.ts` — mock target

## Implementation Steps
1. **Create test file with Express test app**
   - Set up minimal Express app with auth stub, audit middleware, rate limit middleware
   - Mock `pg` query responses to capture INSERT calls
   - Mock Redis with `ioredis-mock`

2. **Test: audit entry created on POST**
   - Send POST to test app
   - Verify `pg.query` called with INSERT into `audit_log`
   - Verify entry has: id, timestamp, actor, action, result='success', ipHash

3. **Test: audit entry on DELETE**
   - Send DELETE to test app
   - Verify audit entry with action containing DELETE verb

4. **Test: rate limit enforcement**
   - Send requests exceeding tier limit
   - Verify HTTP 429 response
   - Verify audit entry with result='denied'

5. **Test: Zod schema rejection**
   - Call `logAudit()` with invalid entry (missing required field)
   - Verify ZodError thrown

6. **Test: hash chain integrity**
   - Create 3 sequential audit entries
   - Verify entry2.previous_hash = hash(entry1)
   - Verify entry3.previous_hash = hash(entry2)

## Todo List
- [ ] Create `tests/integration/audit-trail-e2e.test.ts`
- [ ] Set up Express test app with middleware chain
- [ ] Mock PostgreSQL and Redis
- [ ] Write test: POST -> audit entry creation
- [ ] Write test: DELETE -> audit entry creation
- [ ] Write test: audit entry field correctness
- [ ] Write test: rate limit -> 429 + audit entry
- [ ] Write test: Zod schema rejection
- [ ] Write test: hash chain integrity
- [ ] Run new tests — all pass
- [ ] Run full test suite — no regressions

## Success Criteria
- [ ] 7 new tests written and passing
- [ ] Tests verify audit middleware captures mutations
- [ ] Tests verify rate limiting produces audit trail
- [ ] Tests verify hash chain integrity
- [ ] Tests verify Zod validation rejects bad entries
- [ ] All tests run without external services
- [ ] Test file under 200 lines
- [ ] Full suite: 4301+ passing (no regressions)

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mock mismatch with real DB behavior | Medium | Medium | Mock only PG query layer; test against real schema in CI |
| Express test app doesn't match real server config | Low | Low | Minimal app: only middleware under test, not full server |
| Hash chain test depends on exact hash function | Low | Low | Import actual `hashAuditEntry()` from audit-log module |

## Security Considerations
- Tests verify audit entries are immutable (hash chain)
- Tests verify rate limit denials are logged
- Tests verify no PII leaks into audit metadata

## Next Steps
- Phase 05: Documentation (depends on Phase 01-04)
