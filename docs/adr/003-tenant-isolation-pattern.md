# ADR 003: Tenant Isolation Pattern

**Date:** 2026-06-30  
**Status:** Accepted  
**Deciders:** Solo operator

## Context

The platform serves multiple subscriber tenants. Every database query on platform tables must be scoped to the requesting tenant to prevent data leakage between subscribers.

The desk context has no tenant awareness — it operates as a single operator. Platform code must never "leak" tenant logic into desk modules.

## Decision

**1. `buildTenantFilter()` on every platform DB query**

All platform database queries that touch tenant-owned data MUST include a `tenant_id` filter:

```typescript
function buildTenantFilter(tenantId: string): { sql: string; params: string[] } {
  return { sql: 'AND tenant_id = $1', params: [tenantId] };
}

// Usage in every repository method:
const { sql, params } = buildTenantFilter(tenantId);
await query(`SELECT * FROM trades WHERE 1=1 ${sql}`, params);
```

**2. Desk modules do not use `tenantId`**

Desk modules (strategies, execution, risk) take explicit parameters (wallet, market, allocation) — never `tenantId`, `subscriber`, or `tier`. Platform orchestrators handle tenant context and map it to strategy parameters.

**3. License injection on every request**

Express middleware injects `req.license` (set by `raas-gate`). Fastify decorates `request.getLicenseTier()`. All downstream code reads tenant from the request context, never from global state.

## Consequences

### Positive
- No cross-tenant data leaks possible at the query layer
- Desk code remains simple, single-operator, testable without mocking tenants
- Clear audit trail: every query is tenant-scoped

### Negative
- Every platform DB method must include tenant filter (extra boilerplate)
- Joins across tenant tables require explicit tenantId on both sides
- Cannot share desk DB queries directly — platform must adapt them

## Alternatives Considered

| Approach | Rejected Because |
|----------|-----------------|
| Row-Level Security (RLS) | PostgreSQL RLS adds complexity, harder to test |
| Separate DB per tenant | Overhead for N tenants, no shared analytics |
| Schema-per-tenant | Migration management complexity |
