# ADR-001: Shared Kernel Boundary

**Status:** Accepted  
**Date:** 2026-06-30  
**Deciders:** Mekong Algo Trader architecture team  
**Replaces:** None (new decision)

---

## Context

The Algo Trader codebase supports two distinct operational modes:

1. **Desk** -- Solo proprietary trading. Operator-only, CLI-driven, zero tenant awareness. Owns 52+ strategies, execution, risk, intelligence, signal pipeline, market data, CLI.
2. **Platform** -- RaaS subscriber platform. Multi-tenant, tier-gated, auth-protected. Owns API gateway (31 route files), marketplace, billing, raas executor, metering, audit, referral, notifications, dashboard.

Both modes share foundational concerns: type definitions, database access, configuration loading, logging, encryption, circuit breakers, rate limiting, persistence, and messaging infrastructure.

Without a clear boundary, shared code would drift into platform-specific or desk-specific assumptions, creating hidden coupling. For example, a database utility that assumes a `tenantId` column on every table would be correct for platform queries but wrong for desk queries. A logger that emits `tenantId` metadata would be inappropriate for desk contexts where no tenant exists.

The question: what belongs in `shared/`, and what are the rules for modifying it?

---

## Decision

### What goes in `shared/`

The shared kernel (`src/shared/`) contains **infrastructure primitives with zero business logic**:

| Module | Contents | Rationale |
|--------|----------|-----------|
| `types/` | License, Tier, IStrategy interface, shared enums | Type contracts consumed by both desk and platform |
| `db/` | PostgreSQL client factory, migration runner | Single database; both sides connect through the same pool |
| `config/` | Tier configs, environment schema, Zod validators | Configuration is cross-cutting by nature |
| `utils/` | Logger, encryption, Sentry init, HMAC verifier | Observability and security utilities are context-free |
| `resilience/` | Circuit breakers, rate limiter, recovery manager | Both desk and platform need provider failover and rate control |
| `persistence/` | JSONL file store, key-value store | Used by desk for signal/trade journals and platform for audit logs |
| `messaging/` | NATS JetStream client, pub/sub abstractions | Originally platform-owned, extracted to shared when desk started publishing signals via NATS |
| `redis/` | Redis client singleton, pub/sub helpers | Redis is shared infrastructure -- both sides use it for caching, rate limiting, and pub/sub |

### What does NOT go in `shared/`

- **Business logic.** Strategy position sizing, marketplace commission calculation, tier-gating logic -- these belong in `desk/` or `platform/` respectively.
- **Tenant-aware code.** `buildTenantFilter()` lives in `platform/middleware/` because desk never uses it. Putting it in `shared/` would leak platform assumptions into desk.
- **CLI commands.** `algo scan`, `algo status`, `algo risk` live in `desk/cli/`. Platform has its own CLI surface.
- **Route handlers.** All Express/Fastify routes live in `platform/api/`. No HTTP surface in shared.

### Import rules

```
shared/  ←  importable by ALL layers (foundational)
desk/    →  imports shared/ only; NEVER imports platform/
platform/ →  imports shared/ + desk/ (via IStrategy interface only)
```

- `shared/` must never import from `desk/` or `platform/` -- no inward dependencies.
- `desk/` must never import from `platform/` -- this is the hard boundary.
- `platform/` may import from `desk/strategies/` but only through the shared `IStrategy` interface, not through concrete strategy classes directly.

### Modification rules

1. **Adding to shared requires zero business-logic leakage.** If a proposed addition to `shared/` references `tenantId`, `subscriber`, `tier`, or any platform-specific concept, it belongs in `platform/`.
2. **Removing from shared requires both consumers to stop using it.** No consumer should break silently.
3. **Barrel exports are mandatory.** Every `shared/` subdirectory exports a `index.ts` barrel so consumers import from `@/shared/types` not `@/shared/types/license-types`.
4. **Shared modules are sync-loaded.** No dynamic imports in shared -- both desk and platform import them at module init.

### Why messaging/resilience/redis are shared, not platform-owned

| Module | Initial location | Why moved to shared |
|--------|-----------------|---------------------|
| `messaging/` (NATS) | `platform/` | Desk started publishing signal events via NATS for platform consumption. Moving NATS client to shared avoided a circular dependency (desk importing platform's NATS client). |
| `resilience/` | Embedded in desk | Platform's raas executor needed the same circuit breaker pattern for provider failover during subscriber trade execution. |
| `redis/` | Embedded in desk | Platform's rate limiting, session cache, and pub/sub all access the same Redis cluster. |

These are infrastructure components, not business components. They have no opinion about who uses them or why. That makes them canonical shared-kernel candidates.

---

## Consequences

### Positive

- **Clear ownership.** Every developer knows where to put new code: if it has no business logic and is used by both sides, shared. Otherwise, desk or platform.
- **No hidden coupling.** Desk can evolve independently of platform. Platform can add new tenant features without touching desk.
- **Testable in isolation.** Shared modules are tested without desk or platform imports. The 11 boundary tests verify this constraint.
- **Prevents future circularity.** Before the separation, desk importing NATS from platform would have created a circular dependency if desk ever exposed something platform needed. Now both import from shared.

### Negative

- **Coordination cost for shared changes.** Any change to `shared/` must be validated against both `desk/` and `platform/` consumers. A type change in `IStrategy` could break 52+ strategy classes.
- **Barrel export maintenance.** Every new shared module needs an index.ts barrel. Forgetting one means the import fails at compile time (loud failure, which is acceptable).
- **Initial migration effort.** Extracting `messaging/` and `redis/` from their original contexts required careful path-rewriting across 50+ files. This work is complete.

### Neutral

- Shared kernel size may grow over time as more infrastructure is extracted. A future ADR may need to split `shared/` into sub-kernels (e.g., `shared/infra/` vs `shared/types/`) if it exceeds ~20 modules.

---

## References

- [ADR-002: Desk-Platform Separation](./desk-platform-separation.md)
- [ADR-003: Strategy Ownership Model](./strategy-ownership-model.md)
- [ADR-004: Tenant Isolation Pattern](./tenant-isolation-pattern.md)
- `docs/system-architecture.md` -- Full system architecture with bounded context diagrams
- `CLAUDE.md` -- Module layout and import rules
- `tests/integration/boundary/` -- 11 boundary enforcement tests
