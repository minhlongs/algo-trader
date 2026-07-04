# Brainstorm: Marketplace End-to-End — Refined Plan

**Date:** 2026-07-01 17:54 | **Source:** `plans/260701-0030-marketplace-end-to-end/plan.md` | **Mode:** deep

## Problem

Marketplace "code complete" (27 routes, 5 services, 8 repos) nhưng không có flow thật: subscriber không thể pay, strategy không chạy sau subscribe, frontend chưa có subscribe flow.

## What Changed Since Original Plan (00:30 today)

- ✅ Architecture desk ↔ platform separated — execution bridge khả thi
- ✅ Marketplace stocking done — 6 active strategies, frontend dynamic
- ✅ Auth typing fixed — `Request` interface typed, không còn `as any`
- ✅ Security audit done — CSP, headers, fail-fast auth

## Refined Approach

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Payment integration | **Tái dùng NOWPayments billing flow** | Invoice flow đã có + tested. Tạo invoice khi subscriber chọn strategy, IPN webhook activate subscription |
| Execution bridge | **Bridge mỏng qua SubscriberExecutor** | Subscription active → gọi `SubscriberExecutor` có sẵn trong `platform/raas/`. Dùng shared `IStrategy` interface |
| Scope | **Core flow trước** | Subscribe → pay → execute → manage. Reviews + revenue reconciliation để phase sau |

### Phases

| # | Phase | Priority | Files | Deps |
|---|-------|----------|-------|------|
| 01 | Payment Flow — NOWPayments invoice → subscription activation | P0 | ~4 | none |
| 02 | Execution Bridge — subscription → SubscriberExecutor | P0 | ~5 | Phase 01 |
| 03 | Frontend — subscribe button, payment UI, manage subscriptions | P1 | ~8 | Phase 01, 02 |
| 04 | Smoke Test — end-to-end: browse → subscribe → pay → execute | P2 | ~2 | Phase 03 |

### Out of Scope (this round)

- Review/rating system UI (API đã có, chưa làm frontend)
- Revenue reconciliation tự động (math 20/80 đã có, chưa automate)
- Route-level integration tests (làm sau khi core flow ổn định)
- Multi-region deployment
- `pnpm update` (36 CVEs — làm riêng để tránh break tests)

### Key Touchpoints

| Module | Purpose |
|--------|---------|
| `src/platform/billing/` | NOWPayments invoice + IPN webhook — tạo invoice cho subscription |
| `src/platform/marketplace/` | Subscription service, marketplace service |
| `src/platform/raas/` | SubscriberExecutor — chạy strategy cho subscriber |
| `src/platform/api/routes/` | Marketplace routes (đã có 9 files) |
| `dashboard/src/pages/` | Marketplace page (dynamic), cần thêm subscribe flow |
| `src/shared/types/` | IStrategy interface — bridge giữa desk và platform |

### Quality Gates

- `tsc --noEmit` → 0 errors
- `vitest run` → all existing tests pass
- Manual E2E: browse strategies → subscribe → pay USDT → strategy executes → tenant sees P&L

## Next Step

Hand off to `/ck:plan` for detailed implementation plan with file-level steps.
