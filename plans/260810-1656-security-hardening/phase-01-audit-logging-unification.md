# Phase 01: Audit Logging Unification

## Context Links
- Research: `plans/reports/audit-logging-research.md`
- Existing seed: `src/seed/security/audit-log.ts:1`
- Existing platform: `src/platform/audit/tenant-audit-log.ts:1`
- Migrations: `src/db/migrations/038-audit-log.ts`, `039-audit-log-tenant.ts`, `040-audit-immutability.ts`
- Tests: `src/seed/security/__tests__/audit-log.test.ts`, `src/platform/audit/__tests__/tenant-audit-chain.test.ts`

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Unify dual audit logging systems (`audit_log` + `tenant_audit_logs`) into single immutable hash-chained table with per-tenant sequence numbers. Extend existing `audit_log` table with hash-chain columns and atomic sequence generation.

## Key Insights from Research
1. Two separate audit systems exist: `audit_log` (seed layer, general purpose) + `tenant_audit_logs` (platform layer, hash-chained immutable)
2. `audit_log` has `tenant_id` but no hash chain; `tenant_audit_logs` has hash chain but separate table
3. Both have `(tenant_id, timestamp DESC)` index — good for per-tenant queries
4. Current `tenant_audit_logs` only used by platform audit service; seed `logAudit()` not integrated
5. Sequence generation needs atomic increment: `SELECT MAX(sequence_number) + 1` in transaction

## Requirements

### Functional
- Single write path: all calls → `seed/security/audit-log.ts:logAudit()` → computes hash/sequence → writes
- Per-tenant monotonically increasing sequence_number (1, 2, 3...)
- **HMAC-SHA256 hash chain** with dedicated signing key: `hash = HMAC_SHA256(signing_key, sequence + previous_hash + canonical_json(payload))`
- `verifyChain(tenantId)` validates entire chain integrity
- Retention policy: 90 days default (configurable per tenant)
- Dead letter queue: failed audit writes buffered locally + retried; alert on persistent failure

### Non-Functional
- Zero `any` types, full TypeScript strict mode
- All DB writes in transactions
- Fail-closed on write failure (throw, don't silently drop audit events)
- <5ms p99 write latency

## Architecture

### Data Flow
```
Caller → logAudit(entry) → beginTransaction
  → SELECT MAX(sequence_number) FROM audit_log WHERE tenant_id = ?
  → compute hash = SHA256(seq + prev_hash + canonicalJson(payload))
  → INSERT audit_log (..., sequence_number, hash, previous_hash)
  → commitTransaction
  → return { id, sequence_number, hash }
```

### Schema Changes (Migration 041)
```sql
ALTER TABLE audit_log
ADD COLUMN IF NOT EXISTS sequence_number BIGINT,
ADD COLUMN IF NOT EXISTS hash TEXT,
ADD COLUMN IF NOT EXISTS previous_hash TEXT;

-- Backfill existing rows: sequence_number = ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY timestamp)
-- First row per tenant: previous_hash = '' (empty string)
-- Create unique index: (tenant_id, sequence_number)
-- Create index for chain verification: (tenant_id, sequence_number)
```

## Related Code Files

### Modify
1. `src/seed/security/audit-log.ts` — add HMAC-SHA256 hash/sequence logic to `logAudit()`, add `verifyChain()`, add dead letter queue
2. `src/seed/security/types.ts` — extend `IAuditEntry` with `sequence_number`, `hash`, `previous_hash`, `signing_key_id`
3. `src/db/migrations/041-audit-hash-chain.ts` — new migration (create)
4. `src/seed/security/audit-middleware.ts` — ensure it passes `tenant_id` from request context
5. `src/seed/security/crypto.ts` — add `getHmacKey(keyId)`, `canonicalJson()` utilities

### Create
5. `src/seed/security/audit-hash-chain.ts` — hash chain computation utilities (extracted from platform)

### Deprecate
6. `src/platform/audit/tenant-audit-log.ts` — mark deprecated, redirect to seed `logAudit()`
7. `src/platform/audit/tenant-audit-chain.test.ts` — migrate tests to seed layer

## Implementation Steps

1. **Create Migration 041**: Add `sequence_number INTEGER NOT NULL DEFAULT 1`, `previous_hash TEXT`, `hash TEXT NOT NULL`, `tenant_id TEXT NOT NULL` (make NOT NULL after backfill), `signing_key_id TEXT NOT NULL DEFAULT 'v1'` to `audit_log`. Add unique index `(tenant_id, sequence_number)`. Add composite index `(tenant_id, timestamp DESC)`.

2. **Backfill Script** (in migration or separate): For each tenant, order by `timestamp, id`, assign sequential numbers, compute hash chain using HMAC-SHA256 with signing key 'v1'. Set `signing_key_id = 'v1'`.

3. **Update `audit-log.ts` and `crypto.ts`**:
   - Add `getHmacKey(keyId)` fetching from env/CF Secrets (dedicated `AUDIT_HMAC_KEY_v1`, `AUDIT_HMAC_KEY_v2`, etc.)
   - Add `canonicalJson(payload)` → deterministic key sort (`JSON.stringify(payload, Object.keys(payload).sort())`)
   - Replace SHA-256 with `createHmac('sha256', key).update(canonicalPayload).digest('hex')`
   - In `logAudit()`: acquire per-tenant advisory lock (`pg_advisory_xact_lock(hashtext(tenant_id))`), fetch `MAX(sequence_number) WHERE tenant_id`, insert with `sequence_number = max + 1`, compute hash with `previous_hash` from last row
   - Add `deadLetterQueue` array + `flushDeadLetters()` retry logic (max 3 retries, exponential backoff, alert on persistent failure)

4. **Deprecate `tenant_audit_log.ts`**: Mark with `@deprecated`, add migration comment. Keep `verifyChain()` for backward compat during transition.

5. **Startup Validation**: At module load, verify `AUDIT_HMAC_KEY_v1` exists; fail-fast if missing.

6. **Tests**: Sequence uniqueness under concurrency, hash chain verification, HMAC key rotation, dead letter queue, retention cleanup, cross-tenant isolation.

## Todo List
- [ ] Create migration 041-audit-hash-chain.ts
- [ ] Extend IAuditEntry type with hash-chain fields
- [ ] Implement computeAuditHash() utility
- [ ] Modify logAudit() with transaction + sequence + hash
- [ ] Add verifyAuditChain(tenantId) function
- [ ] Update auditMiddleware to pass tenant_id
- [ ] Deprecate platform/tenant-audit-log.ts
- [ ] Run migration and verify backfill
- [ ] Write unit tests (chain verify, concurrent, backfill)
- [ ] Write integration test (middleware → DB → verify)

## Success Criteria
- `logAudit()` returns entry with `sequence_number` and `hash`
- `verifyAuditChain(tenantId)` returns `{ valid: true }` for unmodified chain
- `verifyAuditChain(tenantId)` returns `{ valid: false, brokenAt: N, reason: "..." }` for tampered row
- All existing tests pass + new tests cover hash chain
- Migration 041 applies cleanly to existing `audit_log` table
- p99 write latency <5ms under load

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sequence collision under concurrent writes | Medium | High | Use `SELECT ... FOR UPDATE` or advisory lock per tenant |
| Backfill produces wrong sequence order | Low | High | Use `ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY timestamp, id)` deterministic ordering |
| Migration locks table too long | Low | Medium | Run during maintenance window; backfill in batches if >100k rows |
| Hash computation mismatch between Node/PG | Low | High | Single implementation in TypeScript, no PG function |

## Security Considerations
- Hash chain prevents tampering: any modification breaks verification
- IP addresses already hashed via `hashIpAddress()` before storage
- `tenant_id` enforcement at query layer prevents cross-tenant leakage
- No PII in metadata (sanitized by middleware)

## Next Steps
- Phase 02: Redis Rate Limiter tier integration (independent)
- Phase 04: Integration tests covering audit + rate limit + encryption