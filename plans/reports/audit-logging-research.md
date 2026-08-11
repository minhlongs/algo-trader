# Audit Logging Research Report

## Existing Infrastructure

### 1. Seed Layer (Single Source of Truth)
- **File**: `src/seed/security/audit-log.ts`
- **Table**: `audit_log` (PostgreSQL)
- **Schema**: `id, timestamp, actor, action, resource, result, metadata, ip_hash, tenant_id`
- **Functions**: `logAudit()`, `getAuditTrail()`, `getAuditTrailByTenant()`
- **Middleware**: `auditMiddleware` (Express-compatible, auto-logs HTTP responses)

### 2. Platform Layer - Tenant Audit Chain
- **File**: `src/platform/audit/tenant-audit-log.ts`
- **Table**: `tenant_audit_logs` (hash-chained, per-tenant sequence)
- **Schema**: `id, tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at`
- **Immutability**: Hash chain validation via `verifyChain()` (SHA-256 chain)
- **Indexes**: `(tenant_id, created_at DESC)`, `(tenant_id, sequence_number DESC)`
- **Unique constraint**: `(tenant_id, sequence_number)`

### 3. Platform Layer - Service Wrapper
- **File**: `src/platform/audit/audit-log-service.ts`
- **Singleton**: `AuditLogService.getInstance()`
- **Features**: Batch logging, retention cleanup, CSV/JSON export
- **Routes**: `/api/v1/audit/*` in `src/api/routes/audit-routes.ts`

### 4. Tenant Isolation
- **File**: `src/raas/subscriber-tenant-isolator.ts`
- **Pattern**: `buildTenantFilter(subscriberId)` returns `{clause, paramIndex, params}`
- **Enforcement**: `assertTenantAccess(requestId, tokenId, isAdmin)`
- **All subscriber queries MUST use this**

### 5. Trade/Order Execution Points
- **Order placement**: `src/desk/execution/live-order-manager.ts` (placeOrder, cancelOrder)
- **Trade recording**: `src/db/schema.sql` → `trades` table
- **Paper trades**: `paper_trades_v3` table (source-tagged for A/B)
- **Pipeline**: `src/desk/polymarket/trading-pipeline.ts` wires scanner→strategies→executor

### 6. System Config Changes
- **License/feature flags**: `src/api/routes/license-routes.ts`, `audit-routes.ts:/license/:id/audit`
- **Admin actions**: `admin-qwen-routes.ts`

## Integration Points for ORIGINAL_REQUEST

| Event Type | Location | Proposed Hook |
|------------|----------|---------------|
| Trade execution | `live-order-manager.ts` emit('matched') | `logAudit({action: 'trade.execute', resource: 'Trade:<id>'})` |
| Order placement | `live-order-manager.ts` placeOrder() | `logAudit({action: 'order.place', resource: 'Order:<id>'})` |
| Order cancel | `live-order-manager.ts` cancelOrder() | `logAudit({action: 'order.cancel', resource: 'Order:<id>'})` |
| Config change | License/routes, admin routes | Extend existing `auditService.log()` calls |
| System events | Pipeline start/stop, strategy enable/disable | Add `logAudit` in pipeline lifecycle |

## Schema/Index/Immutability Considerations

### Current `audit_log` table (seed layer)
- **Gap**: No hash chaining, no sequence_number per tenant
- **Fix**: Add `sequence_number BIGINT`, `hash VARCHAR(64)`, `previous_hash VARCHAR(64)` columns + unique constraint `(tenant_id, sequence_number)`

### Current `tenant_audit_logs` table (platform layer)
- **Has**: Full hash chain, sequence_number, unique constraint
- **Gap**: Only used by platform audit service; not integrated with seed `logAudit()`

### Recommended Approach
1. **Extend seed `audit_log`** with hash-chain columns (migration)
2. **Unify**: Make `tenant_audit_logs` a view or deprecated alias
3. **Single write path**: All calls → `seed/security/audit-log.ts:logAudit()` → computes hash/sequence → writes
4. **Index**: `(tenant_id, created_at DESC)` already exists in both

## Unresolved Questions

1. **Single vs dual table**: Keep `tenant_audit_logs` as separate immutable chain, or merge into `audit_log`?
2. **Sequence generation**: Per-tenant sequence needs atomic increment (SELECT MAX + 1 in transaction?)
3. **Backfill**: How to hash-chain existing `audit_log` rows (prev_hash = '' for first)?
4. **Retention**: `tenant_audit_logs` has no retention policy; `audit_log` has 90-day default
5. **Export format**: CSV/JSON export in service — include hash chain verification flag?
6. **Cross-tenant queries**: Admin routes currently bypass tenant filter — should audit logs respect same isolation?