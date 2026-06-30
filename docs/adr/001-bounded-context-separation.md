# ADR 001: Bounded Context Separation

**Date:** 2026-06-30  
**Status:** Accepted  
**Deciders:** Solo operator

## Context

The algo-trader codebase had grown to ~2,200 source files with two distinct usage patterns:
1. **Solo proprietary trading** — operator-only CLI, no tenant awareness, single-user
2. **RaaS subscriber platform** — multi-tenant API, tier-gated, auth-protected

These were intermixed without clear boundaries. Platform code imported desk code freely, shared utilities had business logic, and there was no enforcement of what belonged where.

## Decision

Separate the codebase into three bounded contexts with strict import rules:

```
src/
├── shared/    # Shared kernel — types, DB client, config, logger (zero business logic)
├── desk/      # Solo trading — strategies, execution, risk, CLI (no tenant awareness)
└── platform/  # RaaS platform — API routes, billing, marketplace (multi-tenant)
```

**Import rules:**
- `shared/` → importable by ALL layers
- `desk/` → imports `shared/` only; NEVER imports `platform/`
- `platform/` → imports `shared/` + `desk/` (for strategy access via shared interfaces)

## Consequences

### Positive
- Clear mental model: each context has a single responsibility
- Desk code stays tenant-free → simpler, testable, no auth leakage
- Platform code can't accidentally depend on CLI-only modules
- Shared kernel prevents circular dependencies

### Negative
- Some code had to be moved (Phase 1-2: ~40 files reorganized)
- Strategy access requires explicit bridge (see ADR 004)
- Build verification needed for boundary violations

## Alternatives Considered

| Approach | Rejected Because |
|----------|-----------------|
| Keep everything together | Unclear boundaries, tenant logic leaking into desk |
| Separate packages/npm workspaces | Overhead not justified for 3-context monorepo |
| Monorepo with build-time checks | Same outcome, more tooling |
