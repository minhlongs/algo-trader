# 2026-06-18 — Stitch Dashboard Implementation

Implemented Stitch-aligned dashboard UI primitives and converted the generated dashboard pages to React/Vite/Tailwind while preserving existing auth/routing contracts. `/app/neg-risk` now intentionally uses its own full-page layout outside `LayoutShell`.

Key changes:
- Added shared Stitch tokens and reusable UI primitives under `src/components/ui/stitch-*`.
- Converted dashboard, marketplace, backtests, license, reporting, settings, account, guide, setup, and negative-risk pages to Stitch styling.
- Fixed TypeScript regressions in `App.tsx`, RUM resource timing, Stitch input passthrough props, reporting analytics imports, and dashboard widget imports.
- Replaced the blocking `alert()` trade action in `NegRiskDashboardPage` with an inline toast.
- Removed the `LayoutShell` wrapper for `/app/neg-risk` so the page's fixed header/sidebar no longer conflicts with the app shell.
- Fixed `StitchButton` `asChild` style merge and added a sidebar nav item for `/app/neg-risk`.
- Added `src/stores/neg-risk-scanner-store.ts` for the un-routed scanner page compile target.

Verification:
- `pnpm tsc --noEmit` passed.
- `pnpm vitest run src/pages/__tests__/neg-risk-dashboard-page.test.tsx` passed: 6/6 tests.
- `pnpm build` passed; only existing Vite chunk-size warning.
- Commit: `cc72379b`.

Reviewer caveat:
- Reviewer flagged missing `@types/node` as a critical build blocker, but local `pnpm tsc --noEmit` and `pnpm build` from `/Users/macbook/algo-trader/dashboard` passed after the final fixes.
