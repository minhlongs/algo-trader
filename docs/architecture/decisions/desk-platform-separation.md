# ADR-002: Desk-Platform Separation

**Status:** Accepted  
**Date:** 2026-06-30  
**Deciders:** Mekong Algo Trader architecture team  
**Replaces:** None (new decision -- replaces implicit single-context architecture)

---

## Context

Algo Trader serves two distinct user profiles with conflicting requirements:

**Desk (operator-only):**
- A single human runs the entire quantitative trading desk.
- CLI-driven workflow: `algo scan`, `algo status`, `algo risk`, `algo backtest`.
- Zero tenant awareness -- there is one operator, one set of API keys, one P&L ledger.
- Strategies are property of the desk, evolved through backtesting and live trading.
- Performance is measured in absolute P&L, Sharpe ratio, and drawdown depth.

**Platform (subscriber-facing):**
- Multiple subscribers access trading strategies through tier-gated SaaS plans (FREE, PRO, ENTERPRISE).
- HTTP API-driven: 31 route files with Express middleware for auth, tier gating, rate limiting.
- Every database query is scoped to a tenant via `tenantId`.
- Strategies are products in a marketplace -- subscribers pay to access, creators earn revenue share.
- Performance is measured in MRR, churn rate, and subscriber satisfaction.

Before June 2026, both concerns lived in a single `src/` tree without clear boundaries. A function in what is now `desk/risk/` might have referenced `tenantId` from a platform schema. A route handler in `platform/api/` might have imported a concrete strategy class directly. The codebase was a monolith with implicit assumptions about which code belonged to which context.

The question: should desk and platform be separate codebases, separate packages in a monorepo, or separate bounded contexts within the same package?

---

## Decision

**Desk and platform are separate bounded contexts within the same TypeScript package (`@mekong/algo-trader`), enforced by import direction rules and verified by boundary tests.**

### Physical layout

```
src/
├── shared/        # Shared kernel (zero business logic)
├── desk/          # Solo proprietary trading
│   ├── strategies/
│   ├── execution/
│   ├── risk/
│   ├── intelligence/
│   ├── signal/
│   ├── market-data/
│   ├── cli/
│   ├── feeds/
│   ├── arbitrage/
│   ├── gate/          # RaaS gate validators (read-only tier config)
│   └── wiring/
└── platform/      # RaaS subscriber platform
    ├── api/
    ├── auth/
    ├── billing/
    ├── marketplace/
    ├── raas/
    ├── metering/
    ├── middleware/
    ├── audit/
    ├── referral/
    ├── workers/
    ├── telegram/
    └── notifications/
```

### Key design decisions

#### 1. Desk has no tenantId

Every desk module is written with the assumption that there is exactly one operator. Database queries in `desk/` never include a `WHERE tenant_id = ?` clause. Strategy state is global. Position tracking is global. Risk limits apply to the aggregate desk, not per-subscriber.

This is the single most important invariant. If any desk module references `tenantId`, `subscriber`, or `tier`, it is a boundary violation.

#### 2. Platform always has tenantId

Every platform database query is scoped via `buildTenantFilter(tenantId)`. Every API route extracts `tenantId` from the authenticated session. Every marketplace listing is owned by a tenant. Every raas execution runs in a tenant sandbox.

This is enforced by the `requireTier` middleware, which attaches the tenant's license to the request object before any handler executes.

#### 3. Cross-context communication via shared types only

Desk and platform communicate through three mechanisms, all mediated by `shared/`:

| Mechanism | Direction | Shared type |
|-----------|-----------|-------------|
| Strategy access | platform → desk | `IStrategy` interface in `shared/types/` |
| Signal publishing | desk → platform | `Signal` type in `shared/types/` |
| NATS messages | bidirectional | Topic schemas in `shared/messaging/` |

No direct imports between `desk/` and `platform/`. No shared mutable state. No shared database tables (platform tables have `tenantId`; desk tables do not).

#### 4. Why not separate packages?

Considered and rejected: `@mekong/desk` and `@mekong/platform` as separate npm packages.

**Reasons for rejection:**
- Both share the same Prisma schema, database, and Redis cluster. Splitting would require a shared third package for the schema, adding npm-link complexity.
- Both run in the same Node.js process in some deployments (CLI mode loads desk + platform API server).
- The TypeScript path aliases (`@/shared/*`, `@/desk/*`, `@/platform/*`) provide clear boundaries within a single package. Separate packages would require npm workspaces, linked dependencies, and coordinated version bumps.
- The current team is small. Monorepo overhead is not justified at this scale.

**Revisit criteria:** If a second team takes ownership of `platform/` independently, or if `desk/` is extracted to run on a separate machine without `platform/` dependencies, repackage as separate npm packages.

#### 5. Why not separate codebases?

Considered and rejected: `algo-trader-desk` and `algo-trader-platform` as separate git repositories.

**Reasons for rejection:**
- Shared types would need a third repository or a published npm package for type sharing.
- Co-evolving the IStrategy interface across repos would create version-sync friction.
- The single-repo approach makes cross-cutting changes (e.g., adding a new shared resilience pattern) atomic -- one commit, both contexts updated.

**Revisit criteria:** If the platform team grows beyond 3 contributors and desk/platform release cycles diverge significantly (platform releases weekly, desk releases daily), split into separate repos with a shared types package.

---

## Consequences

### Positive

- **Clear mental model.** New contributors know immediately: "is this for the operator or for subscribers?" The directory structure answers the question.
- **Independent evolution.** Desk can add 10 new strategies without touching a single platform file. Platform can add a new billing provider without touching desk.
- **Test isolation.** Desk tests never need to mock tenant context. Platform tests never need to mock CLI args.
- **Deployment flexibility.** Desk can run as a CLI on the operator's machine. Platform can run as a server on Cloudflare. They share code but have independent lifecycles.

### Negative

- **Duplication of similar patterns.** Both desk and platform need database access, but desk queries are global while platform queries are tenant-scoped. The query helpers look similar but cannot be unified without introducing a tenant-awareness toggle in shared (which would violate ADR-001).
- **Cross-context changes require careful coordination.** Adding a field to `IStrategy` requires updating `shared/types/`, all 52+ strategy classes in `desk/strategies/`, and the marketplace listing logic in `platform/marketplace/`.
- **The `gate/` directory in desk is a gray area.** It contains RaaS gate validators that read tier configuration -- a platform concern. It lives in `desk/` because it validates strategy access at the desk boundary without importing platform code. This is deliberate: the gate is a desk-side enforcement point that happens to consult tier config from `shared/config/`. It does not import from `platform/`.

### Neutral

- The boundary is enforced by convention + tests, not by a build tool. A developer could add a `desk/ → platform/` import and it would compile. The 11 boundary tests (`tests/integration/boundary/`) run on every CI gate and catch this. Future: consider an ESLint rule for import boundary enforcement.

---

## References

- [ADR-001: Shared Kernel Boundary](./shared-kernel-boundary.md)
- [ADR-003: Strategy Ownership Model](./strategy-ownership-model.md)
- [ADR-004: Tenant Isolation Pattern](./tenant-isolation-pattern.md)
- `docs/manifesto.md` -- Solo Quant Desk manifesto (governs `desk/`)
- `docs/platform-doctrine.md` -- RaaS subscriber platform governance
- `CLAUDE.md` -- Module layout and import rules
