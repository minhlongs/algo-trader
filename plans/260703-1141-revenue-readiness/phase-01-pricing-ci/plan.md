---
title: "Phase 1 — Unify Pricing + Fix CI"
description: "Resolve the 7 conflicting pricing schemes across the codebase and fix the 2 broken CI tests on main"
status: complete
priority: P0
effort: M
needsStitch: false
---

# Phase 1 — Unify Pricing + Fix CI

## Context
The codebase has 7 different pricing schemes:
- `nowpayments-service.ts`: PRO=$99, ENTERPRISE=$299, MASTER=$999
- `revenue-analytics.ts`: PRO=$49, ENTERPRISE=$199, MASTER=$999
- `pricing.html` (live): PRO=$99/$79 annual, ENTERPRISE=$299/$239 annual, MASTER=$999/$799 annual
- `landing-page.md`: PRO=$99, ENTERPRISE=$299, MASTER=$999
- `CLAUDE.md`: PRO=$299/mo, ENTERPRISE=$599/mo, MASTER=$999/mo
- Email drip templates: Starter=$49, Pro=$149, Elite=$499 (old scheme)
- README: PRO=$299, ENTERPRISE=$599, MASTER=$999

## Canonical Pricing (Decision)
- PRO: $99/mo (Billions) — startup/individual quant
- ENTERPRISE: $299/mo (Hundreds of Billions) — professional firm
- MASTER: $999/mo (Trillions) — institutional

## Tasks
1. Fix 2 failing tests in `shared-db-contract.test.ts` (mock pool pollution)
2. Unify all pricing configs to canonical values
3. Update email drip templates to match
4. Update CLAUDE.md, README to match
5. Verify: `pnpm test` exits 0, pricing consistent across all files

## Files to modify
- `src/platform/billing/nowpayments-service.ts` (NOWPAYMENTS_TIERS)
- `src/platform/api/routes/revenue.ts` or wherever revenue-analytics.ts lives
- `dashboard/src/pages/pricing-page.tsx`
- `src/platform/landing/public/pricing.html`
- Email templates in trial-drip
- `CLAUDE.md`, `README.md`
