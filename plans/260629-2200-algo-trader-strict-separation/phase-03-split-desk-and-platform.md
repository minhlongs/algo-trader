---
phase: 3
title: "Split Desk and Platform"
status: pending
priority: P1
effort: "4 weeks"
dependencies: [2]
---

# Phase 3: Split Desk and Platform

## Overview

Create `src/desk/` and `src/platform/` directories. Move all 60 remaining modules to correct side based on boundary rules. Add tenantId columns where missing in platform tables. Wire tier-gating middleware on all platform API routes. Desk CLI remains operational throughout.

## TDD Gate (Tests First)

**Before any module moves, write boundary contract tests:**

1. `tests/integration/desk-platform-boundary.test.ts` — verify no desk module imports from platform, and vice versa
2. `tests/integration/platform-tenant-isolation.test.ts` — verify tenantId filter applied on every platform DB query
3. `tests/integration/platform-tier-gate.test.ts` — verify tier-gating middleware returns 401/403 correctly
4. `tests/integration/desk-cli-contract.test.ts` — verify all CLI commands still execute after separation
5. `tests/integration/platform-api-contract.test.ts` — verify API routes still respond correctly

These tests define the boundary contract. They initially fail (modules not yet separated) — they become the acceptance criteria.

## Requirements

### Functional
- Create `src/desk/` with ~35 modules (trading, strategies, execution, risk, intelligence, etc.)
- Create `src/platform/` with ~25 modules (api, raas, marketplace, billing, auth, etc.)
- Add tenantId to all platform DB tables that query multi-tenant data
- Wire tier-gating middleware on all platform API routes
- Desk CLI commands continue working throughout migration
- Platform REST + WebSocket API continues working throughout migration

### Non-Functional
- Zero circular imports between desk and platform
- Platform modules must use `buildTenantFilter()` on every DB query
- Desk modules must NOT reference tenantId, subscriber, or tier concepts
- All 2,214+ tests pass at every intermediate commit

## Architecture

### Module Assignment Map

```
src/desk/                        src/platform/
├── strategies/ (52+)           ├── api/ (REST+WS gateway)
│   ├── polymarket/             │   ├── routes/
│   ├── cex/                    │   ├── server.ts
│   ├── dex/                    │   └── ws-adapter-redis.ts
│   └── dna/ (GRU neural)      ├── raas/ (subscriber executor)
├── execution/                  ├── marketplace/
│   ├── polymarket-adapter.ts   │   ├── services/
│   ├── paper-executor.ts       │   └── routes/
│   └── order-manager.ts        ├── billing/
├── risk/                       │   ├── invoice-generator.ts
│   ├── kelly-criterion.ts      │   └── nowpayments/
│   └── drawdown-protection.ts  ├── auth/
├── intelligence/               │   ├── auth-server.ts
│   ├── alphaear-client.ts      │   └── better-auth-session.ts
│   └── llm-router.ts           ├── metering/
├── signal/                     │   └── usage-metering-service.ts
│   ├── signal-fusion.ts        ├── middleware/
│   ├── signal-ttl-enforcer.ts  │   ├── distributed-rate-limiter.ts
│   └── signal-publisher.ts     │   ├── feature-gate.ts
├── market-data/                │   ├── prometheus-metrics.ts
│   ├── provider-failover.ts    │   └── error-handler.ts
│   ├── gap-detector.ts         ├── audit/
│   └── sla-tracker.ts          │   └── ai-decision-audit-service.ts
├── polymarket/                 ├── referral/
├── cex/                        ├── workers/
├── dex/                        ├── telegram/
├── feeds/                      ├── notifications/
├── cli/                        ├── messaging/
├── ml/                         │   ├── jetstream-manager.ts
├── markets/                    │   └── bullmq/
├── sandbox/                    ├── dashboard/
├── events/                     ├── resilience/
├── coordination/               │   └── recovery-manager.ts
├── backpressure/               ├── persistence/
├── backup/                     ├── accounting/
├── wire/                       ├── analytics/
├── data/                       ├── landing/
├── exchanges/                  └── ui/
├── interfaces/
├── core/
├── testing/
├── ironclaw/
├── citadel/
├── gate/
├── app.ts
├── index.ts
├── engine.ts
└── trading-pipeline.ts

> **Note:** `messaging/` and `resilience/` were extracted to shared kernel in Phase 2. They are listed above in the platform column for reference but will be imported from `@/shared/messaging/` and `@/shared/resilience/` by both desk and platform.

### Strategy Access Pattern (Platform → Desk)

Platform subscribers access desk-owned strategies via direct import through the shared `IStrategy` interface:

```typescript
// src/platform/api/routes/arb-execute.ts
import { IStrategy } from '@/shared/types/strategy';
import { VwapDeviationSniper } from '@/desk/strategies/polymarket/vwap-deviation-sniper';
import { requireTier } from '@/platform/middleware/feature-gate';

router.post('/arb/execute',
  requireTier('PRO'),                    // Tier gate (platform concern)
  async (req, res) => {
    const strategy: IStrategy = new VwapDeviationSniper();  // Import from desk
    const signal = await strategy.analyze(req.body.market); // Through shared interface
    // ... platform handles tenant context, billing, audit logging
  }
);
```

Key rules:
- Platform imports desk strategy classes directly (no network bridge)
- All communication through `IStrategy` interface in shared/types/
- Platform adds tier-gating, tenant isolation, metering around strategy calls
- Desk strategies remain tenant-unaware (no tenantId parameter)
```

### Boundary Enforcement

```typescript
// Platform: always use tenant filter
import { buildTenantFilter } from '@/platform/db/tenant-filter';
const trades = await db.trade.findMany({
  where: buildTenantFilter(tenantId)
});

// Desk: never reference tenant
import { getCurrentPosition } from '@/desk/risk/position-tracker';
const position = await getCurrentPosition(strategyId); // No tenantId param
```

### Tier-Gating Pattern (Platform Only)

```typescript
// src/platform/middleware/feature-gate.ts
import { TIER_HIERARCHY, FEATURE_ACCESS } from '@/shared/types/tier';

export function requireTier(minTier: Tier) {
  return (req, res, next) => {
    const license = req.license; // Attached by auth middleware
    if (!license) return res.status(401).json({ error: 'No license' });
    if (TIER_HIERARCHY[license.tier] < TIER_HIERARCHY[minTier]) {
      return res.status(403).json({
        error: 'Insufficient tier',
        required: minTier,
        current: license.tier,
        upgrade: `/api/billing/upgrade?from=${license.tier}&to=${minTier}`
      });
    }
    next();
  };
}
```

## Related Code Files

### Create
- `src/desk/index.ts` — barrel export
- `src/platform/index.ts` — barrel export
- `src/platform/db/tenant-filter.ts` — buildTenantFilter()
- `src/platform/middleware/feature-gate.ts` — tier-gating middleware
- `tests/integration/desk-platform-boundary.test.ts`
- `tests/integration/platform-tenant-isolation.test.ts`
- `tests/integration/platform-tier-gate.test.ts`
- `tests/integration/desk-cli-contract.test.ts`
- `tests/integration/platform-api-contract.test.ts`

### Modify
- All ~60 modules: move to desk/ or platform/
- `src/api/server.ts`: update imports to platform paths
- `src/index.ts`: update imports
- All tests: update import paths

### Delete
- Top-level module dirs after move (old locations)

## Implementation Steps

### Step 1: TDD Gate — Write Boundary Tests (Day 1-3)
1. Write `desk-platform-boundary.test.ts` — static analysis: verify no cross-imports
2. Write `platform-tenant-isolation.test.ts` — verify tenantId on queries
3. Write `platform-tier-gate.test.ts` — verify 401/403 responses
4. Write `desk-cli-contract.test.ts` — verify CLI command signatures
5. Write `platform-api-contract.test.ts` — verify API response shapes
6. Document expected failures (tests will pass as modules move)

### Step 2: Create Directory Structure (Day 3-4)
1. Create `src/desk/` and `src/platform/` directories
2. Create barrel exports for each
3. Add `tsconfig.json` path aliases: `@/desk/*`, `@/platform/*`
4. Create `tenant-filter.ts` and `feature-gate.ts` in platform
5. Verify `tsc --noEmit` (no code moved yet, new files only)

### Step 3: Move Platform Modules First (Day 4-11)
Platform modules have more dependencies on shared, fewer on desk:
1. Move `api/` → `src/platform/api/` (update server.ts imports)
2. Move `auth/` → `src/platform/auth/`
3. Move `billing/` → `src/platform/billing/`
4. Move `raas/` → `src/platform/raas/`
5. Move `marketplace/` → `src/platform/marketplace/`
6. Move `metering/` → `src/platform/metering/`
7. Move `middleware/` → `src/platform/middleware/`
8. Move `audit/` → `src/platform/audit/`
9. Move `referral/` → `src/platform/referral/`
10. Move `workers/`, `telegram/`, `notifications/` to platform
11. Move `dashboard/`, `persistence/`, `accounting/`, `analytics/`, `landing/`, `ui/` to platform

After each move:
- Run import rewrite script
- `tsc --noEmit`
- Run tests
- Commit

### Step 4: Move Desk Modules (Day 11-18)
1. Move `strategies/` → `src/desk/strategies/`
2. Move `execution/` → `src/desk/execution/`
3. Move `risk/` → `src/desk/risk/`
4. Move `intelligence/` → `src/desk/intelligence/`
5. Move `signal/` → `src/desk/signal/`
6. Move `market-data/` → `src/desk/market-data/`
7. Move `polymarket/`, `cex/`, `dex/` → desk
8. Move `feeds/`, `cli/`, `ml/`, `markets/` → desk
9. Move `sandbox/`, `events/`, `coordination/` → desk
10. Move `backpressure/`, `backup/`, `wire/`, `data/` → desk
11. Move `exchanges/`, `interfaces/`, `core/`, `testing/` → desk
12. Move `ironclaw/`, `citadel/`, `gate/` → desk
13. Move `app.ts`, `index.ts`, `engine.ts`, `trading-pipeline.ts` → desk

### Step 5: Add Tenant Isolation to Platform (Day 18-22)
1. Audit all platform DB queries — flag any without tenantId filter
2. Add `buildTenantFilter(tenantId)` to flagged queries
3. Add tenantId column to platform tables missing it (migration)
4. Verify tenant isolation with integration test

### Step 6: Wire Tier-Gating (Day 22-25)
1. Add `requireTier()` middleware to all protected platform routes
2. Define tier requirements per route group:
   - `/api/v1/arb/execute` → PRO+
   - `/api/v1/marketplace/strategies` → FREE+
   - `/api/v1/admin/*` → ENTERPRISE+
3. Verify with tier-gate integration test

### Step 7: Gate Check (Day 25-28)
1. All 5 boundary tests pass
2. All 2,214+ original tests pass
3. `pnpm test` — 100% pass
4. `pnpm typecheck` — zero errors
5. `pnpm lint` — under 100 warnings
6. Desk CLI: `pnpm dev` starts correctly, `algo scan` works
7. Platform API: server starts, `/api/health` returns 200

## Success Criteria

- [ ] 5 boundary contract tests written and passing
- [ ] All ~35 desk modules moved to `src/desk/` with correct imports
- [ ] All ~25 platform modules moved to `src/platform/` with correct imports
- [ ] Zero cross-imports between desk/ and platform/ (verified by boundary test)
- [ ] All platform DB queries use `buildTenantFilter(tenantId)`
- [ ] Tier-gating middleware wired on all protected platform routes
- [ ] Desk CLI: `algo scan`, `algo status`, `algo risk` all functional
- [ ] Platform API: health, arb scan, marketplace endpoints respond correctly
- [ ] All 2,214+ tests pass
- [ ] `tsc --noEmit` zero errors

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Module move breaks CLI mid-migration | Medium | Move CLI last; desk modules isolated from CLI during moves |
| Platform API breaks during import rewrites | Medium | Move API module last within platform group; keep server.ts stable |
| Tenant isolation miss — query without filter | High | Automated audit script; integration test catches misses |
| Performance regression from new middleware | Low | Prometheus metrics track p95 latency; compare before/after |
| Circular dependency discovered late | Low | Boundary test runs on every commit; catches immediately |
