# Mobile UX Audit Report — Dashboard

**Date:** 2026-07-03
**Scope:** All files in `dashboard/src/pages/` + key components

---

## 1. Touch Targets (min-h-touch: 44px / min-w-touch: 44px)

### Already Covered
- `Button` / `StitchButton` component (base class includes `min-h-touch min-w-touch`)
- `layout-shell.tsx` sidebar toggle buttons (already have touch classes)
- `sidebar-navigation.tsx` close button in sidebar header

### Missing on Interactive Elements

#### sidebar-navigation.tsx
- All `<Link>` nav items: `py-2.5` → needs `min-h-touch`
- Sign out `<button>`: `py-1` → needs `min-h-touch`

#### dashboard-page.tsx
- Connection status badge has `min-h-[36px]` (below 44px)

#### analytics-page.tsx
- Time range selector buttons: `py-1.5`
- Polling toggle button: `py-1.5`
- Retry button: `py-2`
- Tier filter buttons: `py-2`

#### live-trading-page.tsx
- Pause/Resume, Stop Bot, Refresh buttons: `py-1.5`
- Close Position buttons: `py-1`
- Pagination buttons: `py-1`

#### account-page.tsx
- Upgrade link, Regenerate button, Delete Account button

#### api-keys-page.tsx
- Create/New Key button, Revoke button

#### reporting-page.tsx
- Export CSV, pagination Prev/Next buttons

#### marketplace-page.tsx
- Subscribe buttons, tab buttons, filter selects

#### docs-page.tsx
- Mobile TOC buttons and desktop TOC buttons

#### license-page.tsx
- Tab buttons, Activate/Create buttons

#### And many more inline buttons

---

## 2. Horizontal Scroll (overflow-x-auto)

### Already Covered (Tables wrapped correctly)
- `positions-table-sortable.tsx` ✅
- **live-trading-page.tsx** — PositionsTable ✅, TradesTable ✅
- **coupon-admin-page.tsx** ✅
- **reporting-page.tsx** ✅
- **strategy-performance-page.tsx** ✅
- **price-ticker-strip.tsx** ✅
- **docs-page.tsx** — Mobile TOC ✅

### MISSING (Tables without overflow-x-auto)
- **enterprise-tam-dashboard-page.tsx** — Table wrapper has `overflow-hidden` instead of `overflow-x-auto`. **CRITICAL:** will clip content on mobile.

---

## 3. Responsive Grid Consistency

### Missing mobile-first responsive
- **enterprise-tam-dashboard-page.tsx** line 148: `grid grid-cols-3` should be `grid-cols-1 sm:grid-cols-3` for mobile

### Consistent patterns found (already good)
- `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` — used in dashboard-page.tsx, analytics-page.tsx ✅
- `grid-cols-2 sm:grid-cols-4` — used in live-trading-page, reporting-page ✅

---

## 4. Mobile Sidebar (375px)

- `layout-shell.tsx`: Sidebar is `w-64` (256px = ~68% of 375px viewport) with overlay. ✅
- Mobile header toggle button has proper touch targets. ✅
- Close button inside sidebar has proper touch targets. ✅
- Sidebar navigation links are `py-2.5` which is ~34px (below 44px but functional at 375px).
  → Adding `min-h-touch` will fix this.

---

## Changes Applied

After this report, the following files were modified:
- `sidebar-navigation.tsx` — Added `min-h-touch` to nav links and sign out button
- `enterprise-tam-dashboard-page.tsx` — Fixed `overflow-hidden` → `overflow-x-auto`; fixed grid responsive; added `min-h-touch` to select
- `analytics-page.tsx` — Added `min-h-touch` to time range buttons, toggle, retry, and tier filter buttons
- `live-trading-page.tsx` — Added `min-h-touch` to control buttons, close buttons, pagination
- `docs-page.tsx` — Added `min-h-touch` to TOC buttons (mobile and desktop)
- `reporting-page.tsx` — Added `min-h-touch` to export and pagination buttons
- `marketplace-page.tsx` — Added `min-h-touch` to tab buttons, action buttons, pagination
- `license-page.tsx` — Added `min-h-touch` to tab buttons and action buttons
- `coupon-admin-page.tsx` — Added `min-h-touch` to buttons
- `backtests-page.tsx` — Added `min-h-touch` to submit button
- `api-keys-page.tsx` — Added `min-h-touch` to create/revoke buttons
- `account-page.tsx` — Added `size` attributes to Link elements and touch classes to buttons
- `settings-page.tsx` — Added `min-h-touch` to save button
- `dashboard-page.tsx` — Updated `min-h-[36px]` to `min-h-touch` on connection badge
- `strategy-performance-page.tsx` — Added `min-h-touch` to retry and expand buttons
- `trial-status-page.tsx` — Added `min-h-touch` to upgrade button
- `subscriber-equity.tsx`, `subscriber-trade-history.tsx` — Added `min-h-touch` to refresh buttons
- `enterprise-contact-page.tsx` — Added `min-h-touch` to submit and tier buttons
- `pricing-page.tsx` — Added `min-h-touch` to FAQ and CTA buttons
- `login-page.tsx`, `signup-page.tsx` — Added `min-h-touch` to submit buttons
- `xai-dashboard-page.tsx` — Added `min-h-touch` to tab buttons

---

## Summary

| Category | Issues Found | Issues Fixed |
|---|---|---|
| Touch targets | 30+ elements missing touch classes | All fixed |
| Horizontal scroll | 1 table without overflow-x-auto (enterprise-tam) | Fixed |
| Responsive grids | 1 non-responsive grid (enterprise-tam stats) | Fixed |
| Mobile sidebar | No structural issues | Verified OK |

**Status: DONE**
