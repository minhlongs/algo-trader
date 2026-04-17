# Phase 06 — Subscriber P&L Dashboard (Multi-Tenant Lens) ✓ DONE

**Commits:** 6b089ad → f8e5c5f → fc88d0e → d68665a → db1eb48 | **20 files** | **25/25 backend tests pass** | **tsc clean backend+dashboard**. Deferral: dashboard vitest runtime.


**File ownership:** `src/raas/subscriber-executor.ts`, `src/raas/subscriber-pnl-aggregator.ts`, `src/raas/subscriber-equity-curve-builder.ts`, `src/raas/subscriber-tenant-isolator.ts`, `src/raas/subscriber-activity-metrics.ts`, `src/raas/index.ts`, `dashboard/src/pages/subscriber-overview.tsx`, `dashboard/src/pages/subscriber-trade-history.tsx`, `dashboard/src/pages/subscriber-equity.tsx`, `dashboard/src/components/subscriber-*.tsx`, `src/db/migrations/015_subscriber_*.sql`

**Depends on:** Phase 01 (attestation id per trade), Phase 02 (sandbox exec)

## Context Links

- PDF digest: `plans/reports/researcher-260416-2312-deepseek-solo-platform.md`
- Scout: `plans/reports/scout-260416-2312-raas-reuse-surface.md` (BUILD-NEW #1, #6)
- Existing: `src/billing/usage-metering.ts`, `src/billing/revenue-analytics.ts`, `dashboard/src/pages/analytics-page.tsx`

## Overview

- Priority: P1
- Status: pending
- Brief: Per-subscriber execution + P&L view. Subscriber executor bridges sandbox (Phase 02) + attestation (Phase 01). Dashboard shows per-tenant equity curves, trade history, active signals, blocked-DLP count.

## Key Insights

- Reuse `analytics-page.tsx` chart components; swap global → subscriber-scoped query
- `subscriber-executor.ts` is the anchor missing file per scout (BUILD-NEW #1)
- Strict tenant isolation: every DB query filtered by `subscriber_id`
- Attestation ID recorded per trade for audit provenance

## Requirements

**Functional:**
- `subscriber-executor.ts` wraps sandbox invocation per tenant (calls Phase 02 runtime)
- Per-subscriber equity curve (starting capital → current NAV)
- Trade history filtered by subscriber_id
- Active signals count, fills count, blocked-DLP count
- Tenant isolation enforced at query layer (not just UI)
- Dashboard pages: overview, trade history, equity curve

**Non-functional:**
- Dashboard page load < 1s
- Aggregation queries < 500ms
- Zero cross-tenant data leakage (verified by test)

## Architecture

```
subscriber call ──> subscriber-tenant-isolator ──> subscriber-executor
                                                     │
                                                     ├──> sandbox (P02)
                                                     ├──> attestation (P01)
                                                     ├──> ironclaw (P03)
                                                     └──> exec router (P04)
                                                          │
                                                          └──> trades table (w/ subscriber_id)

dashboard ──> /api/subscriber/:id/pnl ──> subscriber-pnl-aggregator
           ──> /api/subscriber/:id/equity ──> subscriber-equity-curve-builder
```

## Related Code Files

**Create (src/raas/):**
- `src/raas/subscriber-executor.ts` (~180 LOC)
- `src/raas/subscriber-pnl-aggregator.ts` (~150 LOC)
- `src/raas/subscriber-equity-curve-builder.ts` (~150 LOC)
- `src/raas/subscriber-tenant-isolator.ts` (~120 LOC)
- `src/raas/subscriber-activity-metrics.ts` (~120 LOC)
- `src/raas/index.ts` (~40 LOC barrel)
- `src/raas/__tests__/subscriber-executor.test.ts`
- `src/raas/__tests__/subscriber-pnl-aggregator.test.ts`
- `src/raas/__tests__/subscriber-tenant-isolator.test.ts` (cross-tenant leak test)

**Create (dashboard):**
- `dashboard/src/pages/subscriber-overview.tsx` (~180 LOC)
- `dashboard/src/pages/subscriber-trade-history.tsx` (~150 LOC)
- `dashboard/src/pages/subscriber-equity.tsx` (~150 LOC)
- `dashboard/src/components/subscriber-kpi-card.tsx` (~80 LOC)
- `dashboard/src/components/subscriber-equity-chart.tsx` (~120 LOC)
- `dashboard/src/components/subscriber-trade-table.tsx` (~150 LOC)

**Create (api):**
- `src/api/routes/subscriber-pnl-routes.ts` (~150 LOC)

**Modify:**
- `src/db/migrations/015_subscriber_attribution.sql` (add `subscriber_id` FK to trades, orders, signals if missing)
- `src/db/trade-repository.ts` — add subscriber-scoped queries
- `src/api/server.ts` — register new routes

## Implementation Steps

1. Migration 015 — ensure `subscriber_id` column on trades/orders/signals (nullable for legacy, enforced for new)
2. Build `subscriber-tenant-isolator.ts` (query builder helper that forces WHERE subscriber_id=?)
3. Build `subscriber-executor.ts` (resolve subscriber → load BYOK (P01) → invoke sandbox (P02) → record trade)
4. Build `subscriber-pnl-aggregator.ts` (sum realized + unrealized P&L)
5. Build `subscriber-equity-curve-builder.ts` (time-series NAV per day)
6. Build `subscriber-activity-metrics.ts` (signals, fills, blocked-DLP counts)
7. Build REST routes `/api/subscriber/:id/*` with auth + tenant check
8. Build dashboard components + pages
9. Wire React Router in dashboard
10. Cross-tenant leak test: subscriber A queries subscriber B's data → 403
11. E2E: login as sub1 → see only sub1 trades; switch to sub2 → see only sub2

## Todo List

- [ ] Migration 015 applied
- [ ] `subscriber-tenant-isolator.ts` + cross-tenant leak test
- [ ] `subscriber-executor.ts` + test
- [ ] `subscriber-pnl-aggregator.ts` + test
- [ ] `subscriber-equity-curve-builder.ts` + test
- [ ] `subscriber-activity-metrics.ts` + test
- [ ] `subscriber-pnl-routes.ts` + test (auth, tenant gate)
- [ ] Dashboard `subscriber-overview.tsx`
- [ ] Dashboard `subscriber-trade-history.tsx`
- [ ] Dashboard `subscriber-equity.tsx`
- [ ] Dashboard subscriber-* components
- [ ] E2E cross-tenant isolation test

## Success Criteria

- `bun test src/raas` green
- Cross-tenant leak test REJECTS access
- Dashboard renders subscriber-scoped equity curve
- Blocked-DLP count from Phase 03 visible on overview
- No `any` / `@ts-ignore`

## Risk Assessment

- **R1:** Legacy trade rows without `subscriber_id` → backfill script assigns to "legacy-tenant"
- **R2:** Query performance with subscriber_id filter → index on (subscriber_id, ts)
- **R3:** Dashboard auth drift from API auth → reuse `src/middleware/license-validation.ts`

## Security Considerations

- Tenant isolator is the ONLY way to query trades in subscriber context — enforce via ESLint custom rule or code review
- Audit every cross-tenant admin read (license admin only)
- Attestation ID shown alongside each trade for provenance

## Next Steps

- Phase 07 enterprise tier layers SLA + custom-branded view on top
- Post-MVP: subscriber-authored strategy upload
