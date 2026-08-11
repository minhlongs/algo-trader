# Phase 04: Integration & E2E Tests

## Context Links
- Phase 01: `phase-01-audit-logging-unification.md`
- Phase 02: `phase-02-redis-rate-limiter-tier-integration.md`
- Phase 03: `phase-03-aes256-encryption-at-rest.md`
- API server: `src/api/server.ts`
- Audit routes: `src/api/routes/audit-routes.ts`
- Test patterns: `src/seed/security/__tests__/audit-log.test.ts`, `src/forest/rate-limit/__tests__/redis-rate-limiter.test.ts`

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: End-to-end integration tests verifying all three security features work together: audit logging captures rate limit events and credential access, rate limiter enforces tier limits per tenant, encryption protects credentials at rest.

## Requirements

### Functional
- Full request flow: Auth → Rate Limit → Route → Audit Log
- Rate limit exceeded → 429 + audit log entry with tenant_id, IP hash, endpoint
- Credential save/load → encrypted at rest + audit log entry
- Cross-tenant isolation verified at API, DB, and Redis layers
- Multi-tenant concurrent access tested

### Non-Functional
- All tests pass in CI (no flaky tests)
- TypeScript strict mode: 0 errors
- Test coverage ≥80% for new code
- No `any` types, no `@ts-ignore` in test files

## Test Matrix

| Feature | Unit Tests | Integration Tests | E2E Tests |
|---------|-----------|-------------------|-----------|
| Audit Logging | Hash chain, backfill, verify | Middleware → DB → Query | Multi-tenant concurrent writes |
| Rate Limiter | Tier limits, Redis failure | Middleware chain + headers | Burst traffic per tier |
| Encryption | Round-trip, version, failure | Repository save/load | Key rotation simulation |

## Related Code Files

### Create/Modify Tests
1. `src/seed/security/__tests__/audit-log.integration.test.ts` — Full audit flow with DB
2. `src/forest/rate-limit/__tests__/redis-rate-limiter.integration.test.ts` — Middleware chain test
3. `src/db/__tests__/tenant-credentials.encryption.test.ts` — Encryption at rest verification
4. `src/api/__tests__/security-integration.test.ts` — Cross-feature E2E tests

### Test Infrastructure
5. `src/test/utils/test-db.ts` — Test database setup/teardown (if exists)
6. `src/test/utils/test-redis.ts` — Test Redis setup (ioredis-mock)
7. `vitest.config.ts` — Verify test configuration

## Implementation Steps

1. **Set up test infrastructure**: 
   - Verify vitest config supports integration tests
   - Create test DB helper (transaction rollback per test)
   - Create test Redis helper (ioredis-mock per test)

2. **Audit logging integration tests**:
   - Test `logAudit()` → DB → `verifyAuditChain()` round-trip
   - Test middleware logs request/response with tenant_id
   - Test concurrent writes don't break sequence (advisory lock)
   - Test cross-tenant query isolation

3. **Rate limiter integration tests**:
   - Test middleware chain: Auth → RateLimit → Route
   - Test 429 response headers for each tier
   - Test Redis failure → fail-open + audit log
   - Test tenant isolation in Redis keys

4. **Encryption integration tests**:
   - Test repository save → DB encrypted → load → decrypt
   - Test migration 042 applies cleanly
   - Test key version handling

5. **Cross-feature E2E tests**:
   - Request flow: API key auth → rate limit check → audit log entry
   - Credential rotation: save new creds → audit log → verify encryption
   - Rate limit exceeded → audit log captures event with correct metadata
   - Multi-tenant: Tenant A requests don't affect Tenant B limits/logs

6. **Run full test suite**: `npm test` — all pass

## Todo List
- [ ] Verify vitest configuration for integration tests
- [ ] Create test DB helper (transaction rollback)
- [ ] Create test Redis helper (ioredis-mock)
- [ ] Write audit logging integration tests
- [ ] Write rate limiter integration tests
- [ ] Write encryption integration tests
- [ ] Write cross-feature E2E tests
- [ ] Run full test suite: 0 failures
- [ ] Run TypeScript check: `npx tsc --noEmit` — 0 errors

## Success Criteria
- All existing tests still pass
- New integration tests cover all 3 features
- Cross-feature E2E tests verify tenant isolation
- `npm test` exits 0
- `npx tsc --noEmit` exits 0
- No `any` types in new test code
- Test coverage ≥80% for modified files

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Flaky tests due to shared Redis/DB state | Medium | High | Per-test isolation: fresh mock/transaction per test |
| Migration test requires real DB | Low | Medium | Use test container or skip in CI, document |
| Cross-feature test complexity | Medium | Medium | Decompose into focused integration tests first |

## Security Considerations
- Tests verify security properties (isolation, encryption, immutability)
- No real credentials in tests (use fixtures)
- Audit log tests verify hash chain detects tampering
- Rate limit tests verify tenant isolation
- Encryption tests verify fail-closed on decrypt failure

## Next Steps
- All phases complete → merge to main
- Deploy verification per CF-direct doctrine