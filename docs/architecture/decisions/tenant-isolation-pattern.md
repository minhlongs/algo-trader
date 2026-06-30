# ADR-004: Tenant Isolation Pattern

**Status:** Accepted  
**Date:** 2026-06-30  
**Deciders:** Mekong Algo Trader architecture team  
**Replaces:** None (new decision -- replaces implicit single-tenant assumption)

---

## Context

The Algo Trader platform serves multiple subscribers (tenants), each with their own:

- Strategy subscriptions (which strategies they can access)
- Trade history (their own P&L, positions, orders)
- API keys (for exchange access)
- Billing state (tier, payment history, invoices)
- Marketplace listings (if they are strategy providers)
- Usage metering (request counts, execution volume)

Without tenant isolation, one subscriber could see another's trade history, execute trades on another's behalf, or access strategies they haven't paid for. The database schema must guarantee that every platform query is scoped to exactly one tenant.

The desk, by contrast, has exactly one operator. It has no concept of tenants. Its database tables have no `tenantId` column.

The question: how do we enforce tenant isolation in platform while keeping desk tenant-unaware, using a shared database schema?

---

## Decision

**Every platform database query is scoped to a tenant via `buildTenantFilter(tenantId)`. Desk queries have no tenant filter. The database schema uses a shared set of tables where `tenantId` columns exist only on platform-owned tables.**

### The buildTenantFilter pattern

```typescript
// platform/middleware/tenant-isolation.ts
export function buildTenantFilter(tenantId: string): { tenantId: string } {
  return { tenantId };
}

// Usage in a platform repository
async function getSubscriberPositions(tenantId: string): Promise<Position[]> {
  const filter = buildTenantFilter(tenantId);
  return db.position.findMany({
    where: {
      ...filter,
      status: 'OPEN',
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

**Key properties:**
- Every platform repository function accepts `tenantId` as its first parameter.
- `buildTenantFilter` is called at the top of every function and spread into the query's `where` clause.
- The filter is mandatory -- there is no "admin override" path that bypasses tenant scoping. Even admin endpoints use the admin's tenant context.

### Shared schema, tenant column only on platform tables

The PostgreSQL schema (via Prisma) uses a single database with these table categories:

| Category | Tables | Has tenantId? | Accessed by |
|----------|--------|---------------|-------------|
| Platform business | `tenants`, `api_keys`, `subscriptions`, `orders`, `trades`, `invoices`, `marketplace_listings`, `referrals`, `notifications` | Yes | `platform/` only |
| Desk operational | `strategies`, `backtest_results`, `pnl_snapshots`, `signal_journal`, `risk_events` | No | `desk/` only |
| Shared reference | `candles`, `alert_rules`, `market_data_cache` | No | Both (read-only from platform) |
| Auth | `users`, `sessions`, `accounts` | Yes (via userId) | `platform/` (Better Auth) |

**Design principle:** A table either has `tenantId` (platform-owned) or it does not (desk-owned or shared). No table has an optional `tenantId` -- optionality creates ambiguity about whether a query forgot the filter or the table genuinely does not need it.

### Tenant extraction

`tenantId` enters the platform through the authentication layer:

```typescript
// platform/middleware/auth-context.ts
async function extractTenantContext(req: Request): Promise<TenantContext> {
  const session = await getCurrentUser(req);     // Better Auth session
  const tier = await getUserTier(session.userId); // DB lookup
  return {
    tenantId: session.userId,                     // userId IS tenantId
    tier,
    license: buildLicense(tier),
  };
}
```

The extracted `TenantContext` is attached to `req.license` by the `requireTier` middleware for downstream handlers.

### Desk: zero tenant awareness

Desk modules never import `buildTenantFilter`, never reference `tenantId`, and never call `getCurrentUser()`. If a desk module needs to query the database, it uses the shared DB client directly:

```typescript
// desk/risk/position-tracker.ts
import { createServerClient } from '@/shared/db/client';

export async function getOpenPositions(): Promise<Position[]> {
  const db = createServerClient();
  return db.position.findMany({
    where: { status: 'OPEN' },   // No tenantId filter -- desk is global
  });
}
```

This is correct because desk tables have no `tenantId` column. A desk query with `tenantId` would fail at the database level (column not found).

### Cross-context data access

Platform may need to read desk-owned tables (e.g., a subscriber wants to see aggregate strategy performance across all users). This is handled through read-only views:

```sql
-- Platform creates a view that joins platform and desk tables
CREATE VIEW platform.strategy_performance_view AS
SELECT 
  s.name AS strategy_name,
  COUNT(t.id) AS total_trades,
  SUM(t.pnl_usd) AS aggregate_pnl
FROM strategies s                          -- desk table (no tenantId)
JOIN trades t ON t.strategy_id = s.id     -- platform table (has tenantId)
WHERE t.tenant_id = current_setting('app.current_tenant_id')
GROUP BY s.name;
```

The view enforces tenant scoping on the platform table while reading desk data without modification.

---

## Consequences

### Positive

- **Guaranteed isolation.** A query that forgets `buildTenantFilter` returns data across all tenants. The pattern is grep-able: `grep -r "findMany\|findFirst\|findUnique" src/platform/ | grep -v buildTenantFilter` catches missing filters.
- **Desk simplicity.** Desk code never thinks about tenants. It queries the database directly with no scoping overhead.
- **No row-level security dependency.** PostgreSQL RLS would achieve the same goal but couples the application to database-level policy. The application-layer filter is more portable and easier to test.
- **Test isolation.** Platform tests pass a hardcoded `tenantId`. Desk tests never mention tenants.

### Negative

- **Human error surface.** A developer could write a platform query without the tenant filter, and it would compile and run -- returning ALL tenants' data. Mitigation: code review checklist item, CI grep gate, and the 11 boundary tests.
- **No cross-tenant queries in application code.** An admin dashboard that needs "total trades across all tenants" must use a dedicated view or a separate query path with explicit `SELECT ... FROM trades` (no `tenantId` filter). This is by design -- cross-tenant access should be explicit, not accidental.
- **Platform-only tables cannot be queried from desk.** This is also by design. Desk does not care about subscribers.

### Neutral

- As the number of platform tables grows, the risk of a missing filter increases linearly. A future ESLint rule (e.g., `no-unscoped-platform-query`) could automate detection. This is not implemented yet because the current table count (~15 platform tables) is manageable with manual review.

---

## References

- [ADR-001: Shared Kernel Boundary](./shared-kernel-boundary.md)
- [ADR-002: Desk-Platform Separation](./desk-platform-separation.md)
- [ADR-003: Strategy Ownership Model](./strategy-ownership-model.md)
- `src/platform/middleware/tenant-isolation.ts` -- buildTenantFilter implementation
- `src/platform/middleware/auth-context.ts` -- TenantContext extraction
- `tests/integration/boundary/` -- 11 boundary enforcement tests
