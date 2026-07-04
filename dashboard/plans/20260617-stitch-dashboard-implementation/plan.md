---
title: Stitch Dashboard Implementation
status: completed
priority: P1
effort: large
branch: main
tags: [stitch, dashboard, ui, react]
created: 2026-06-17
---

# Stitch Dashboard Implementation Plan

Date: 2026-06-17
Goal: Convert all generated Stitch dashboard exports into React/Vite/Tailwind pages while preserving existing routes, `AuthGuard`, and `LayoutShell`.

## Context

- Stack: React 19, Vite, Tailwind, React Router, Zustand, Vitest.
- Existing app routes wrap `/app/*` pages in `AuthGuard` + `LayoutShell` (`src/App.tsx`).
- Existing pages already cover the required routes:
  - `/app` → `src/pages/dashboard-page.tsx`
  - `/app/strategies` → `src/pages/marketplace-page.tsx`
  - `/app/backtests` → `src/pages/backtests-page.tsx`
  - `/app/licenses` → `src/pages/license-page.tsx`
  - `/app/reporting` → `src/pages/reporting-page.tsx`
  - `/app/settings` → `src/pages/settings-page.tsx`
  - `/app/account` → `src/pages/account-page.tsx`
  - `/app/guide` → `src/pages/guide-page.tsx`
  - `/app/setup` → `src/pages/setup-guide-page.tsx`
  - `/app/neg-risk` → `src/pages/neg-risk-dashboard-page.tsx` (already Stitch-aligned)
- Stitch exports are complete in `stitch-exports/*/design.html` and `stitch-exports/*/DESIGN.md`.

## Page Mapping

| Route | Existing File | Stitch Source |
|---|---|---|
| `/app` | `src/pages/dashboard-page.tsx` | `stitch-exports/cashclaw-dashboard-variant-1/design.html` |
| `/app/strategies` | `src/pages/marketplace-page.tsx` | `stitch-exports/cashclaw-logo-ff86e44b/design.html` |
| `/app/backtests` | `src/pages/backtests-page.tsx` | `stitch-exports/backtest-results-cashclaw-884985d4/design.html` |
| `/app/licenses` | `src/pages/license-page.tsx` | `stitch-exports/licenses-dashboard-aa53a21f/design.html` |
| `/app/reporting` | `src/pages/reporting-page.tsx` | `stitch-exports/cashclaw-trade-reporting-382f18ed/design.html` |
| `/app/settings` | `src/pages/settings-page.tsx` | `stitch-exports/cashclaw-setup-guide-b65ae6e2/design.html` or best matching settings export |
| `/app/account` | `src/pages/account-page.tsx` | `stitch-exports/account-settings-cashclaw-f1824431/design.html` |
| `/app/guide` | `src/pages/guide-page.tsx` | `stitch-exports/cashclaw-operator-guide-running-the-bot-50ada12e/design.html` |
| `/app/setup` | `src/pages/setup-guide-page.tsx` | `stitch-exports/cashclaw-setup-guide-b65ae6e2/design.html` |
| `/app/neg-risk` | `src/pages/neg-risk-dashboard-page.tsx` | Already implemented from Stitch |

## Implementation Strategy

1. Create shared Stitch design primitives:
   - `src/lib/stitch-design-tokens.ts`
   - `src/components/ui/stitch-card.tsx`
   - `src/components/ui/stitch-button.tsx`
   - `src/components/ui/stitch-badge.tsx`
   - `src/components/ui/stitch-input.tsx`
   - `src/components/ui/stitch-table.tsx`
   - `src/components/ui/stitch-tabs.tsx`
2. Replace page content inside existing page files; do not change `src/App.tsx` routes.
3. Keep existing data hooks where useful; use local demo data only when backend is not configured.
4. Preserve `AuthGuard` + `LayoutShell` behavior and sidebar navigation.
5. Keep each page file under 200 lines by extracting repeated UI into shared components.

## Parallel Workstreams

- **Workstream A — Core pages**: dashboard, marketplace, settings.
- **Workstream B — Data pages**: backtests, licenses, reporting.
- **Workstream C — User/content pages**: account, guide, setup.
- **Workstream D — Shared primitives**: design tokens and reusable Stitch UI components.

Workstream D must finish first because A/B/C consume its components.

## Verification

Run these after implementation:

```bash
pnpm tsc --noEmit
pnpm build
pnpm test --run src/pages/__tests__/*.test.tsx
```

Optional manual smoke:

```bash
pnpm dev
```

Check these routes render without console errors:

```text
/app
/app/strategies
/app/backtests
/app/licenses
/app/reporting
/app/settings
/app/account
/app/guide
/app/setup
/app/neg-risk
```

## Risks

- Stitch HTML is desktop-first; add responsive Tailwind breakpoints manually.
- Some Stitch exports may have generic placeholder data; keep real backend hooks where available.
- Do not edit `src/App.tsx`, `src/components/layout-shell.tsx`, or `src/components/sidebar-navigation.tsx` unless a route/navigation contract is broken.
- Avoid secret/API-key exposure in account/settings UI; mask keys and preserve existing security behavior.

## Definition of Done

- All 10 dashboard pages render and match the Stitch exports.
- `pnpm tsc --noEmit` passes.
- `pnpm build` passes.
- Existing page tests pass.
- No public route/navigation/auth contracts changed.
- Code reviewer approves final changes.
