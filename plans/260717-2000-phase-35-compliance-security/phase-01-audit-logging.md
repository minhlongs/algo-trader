--- title: "R1: Multi-Tenant Audit Logging" description: "Add tenantId to audit_log table, upgrade audit-middleware, remove :any casts" status: complete priority: P1 effort: 5h branch: main tags: [audit, compliance, multi-tenant] created: 2026-07-17 ---

# Phase 01: R1 — Multi-Tenant Audit Logging

## Context
- Scout report: `reports/scout-report.md` §1, §2
-kongming advisory: separate write-optimized table, tenantId partitioning, composite index, immutable

## Requirements

### Functional
1. `audit_log` table gains `tenant_id` column (TEXT, nullable for system events)
2. Composite index `(tenant_id, timestamp DESC)` on `audit_log`
3. `audit-middleware.ts` removes all `:any` and `as any` casts
4. Middleware auto-captures `tenantId` from `req.user?.tenantId` when available
5. Immutable: no UPDATE/DELETE paths added

### Non-Functional
- Audit write latency < 5ms p99 (async fire-and-forget pattern preserved)
- `logAudit` call remains fire-and-forget (no response blocking)
- Zero `:any` types in touched files

## Architecture

```
Request → auditMiddleware → response committed → logAudit(entry)
                                                    ↓
                                            audit_log table
                                            [tenant_id, timestamp, actor, action,
                                             resource, result, metadata, ip_hash]
                                                    ↓
                                    idx_audit_log_tenant_timestamp (tenant_id, timestamp DESC)
```

## Files to Modify

| File | Change |
|------|--------|
| `src/db/migrations/039-audit-log-tenant.ts` | **CREATE** — add `tenant_id` + composite index |
| `src/seed/security/types.ts` | Add `tenantId?: string` to `IAuditEntry` |
| `src/seed/security/audit-log.ts` | Include `tenant_id` in INSERT, query by tenant |
| `src/seed/security/audit-middleware.ts` | Remove `:any`, extract `tenantId`, typed res.locals |
| `src/seed/security/audit-validate.ts` | Validate `tenantId` if present |
| `src/platform/api/server.ts` | Apply `auditMiddleware` at gateway level (onRequest) |

## Files to Create

| File | Purpose |
|------|---------|
| `src/db/migrations/039-audit-log-tenant.ts` | Migration: ADD COLUMN tenant_id + composite index |

## Files to Delete

None.

## Implementation Steps

### Step 1: Migration 039 — Add tenant_id to audit_log
- File: `src/db/migrations/039-audit-log-tenant.ts`
- ALTER TABLE audit_log ADD COLUMN tenant_id TEXT
- CREATE INDEX idx_audit_log_tenant_timestamp ON audit_log (tenant_id, "timestamp" DESC)
- Down: DROP INDEX, DROP COLUMN

### Step 2: Update IAuditEntry type
- File: `src/seed/security/types.ts`
- Add `tenantId?: string` field

### Step 3: Update audit-log.ts INSERT
- File: `src/seed/security/audit-log.ts`
- INSERT_SQL: add `tenant_id` column
- Pass `entry.tenantId ?? null` as parameter
- Add `getAuditTrailByTenant(tenantId, limit)` query

### Step 4: Fix audit-middleware.ts — remove :any casts
- File: `src/seed/security/audit-middleware.ts`
- Line 67: remove `const resAny = res as any`
- Wrap res.status with typed interface instead of `as any`
- Line 86: replace `(res as Record<string, ...>)` with typed wrapper
- Extract tenantId: `(req as { user?: { tenantId?: string } }).user?.tenantId`
- Define local interface for wrapped response to avoid `any`

### Step 5: Validate entry with tenantId
- File: `src/seed/security/audit-validate.ts`
- Add optional `tenantId?: string` to validateEntry

### Step 6: Wire at platform API gateway
- File: `src/platform/api/server.ts`
- Add `auditMiddleware` in `setupMiddleware()` as first middleware (onRequest equivalent)
- Verify existing audit route handlers remain compatible

## Todo List
- [ ] Create migration 039
- [ ] Add tenantId to IAuditEntry
- [ ] Update INSERT_SQL with tenant_id
- [ ] Add getAuditTrailByTenant
- [ ] Remove :any casts from audit-middleware.ts
- [ ] Extract tenantId from req.user
- [ ] Add tenantId validation
- [ ] Wire auditMiddleware in platform API server
- [ ] Run `npx tsc --noEmit` → 0 errors
- [ ] Run `npm test` → all pass

## Success Criteria
1. Migration 039 applied, `audit_log` has `tenant_id` column + composite index
2. `grep -rn ':any' src/seed/security/audit-middleware.ts` → 0 match
3. `grep -rn 'console\.\(log\|warn\|error\)' src/seed/security/` → 0 match
4. Audit middleware fires with tenantId when user context exists
5. `getAuditTrailByTenant('tenant-1', 50)` returns scoped results using composite index

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails on large table | Low | Medium | ALTER TABLE ADD COLUMN is fast in PostgreSQL; no data lock |
| :any removal breaks type inference | Low | Low | Use explicit interfaces for res wrapper |
| auditMiddleware double-fires | Medium | Low | Only wire once at gateway level |

## Security Considerations
-tenant_id from `req.user` is trusted (auth middleware sets it)
- IP hashing already in place via `hashIpAddress`
- No new external dependencies

## Rollback
- Migration 039 `down()`: DROP INDEX + DROP COLUMN
- Revert middleware wiring: remove import + middleware call from server.ts
- Rollback tier: L1 (config-only, no data loss)
