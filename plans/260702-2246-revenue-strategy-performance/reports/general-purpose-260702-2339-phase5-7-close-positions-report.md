# Phase 5+7: Close Position Buttons + Integration Tests

## Status: DONE

## Summary

Implemented close position buttons on the live trading dashboard with full integration tests. The feature allows users to close open positions from the positions table with proper loading/error/success states.

## Changes Made

### 1. Backend API Route
- **Created:** `src/platform/api/routes/positions.ts` — Express router with `POST /:id/close` endpoint
- **Modified:** `src/platform/api/server.ts` — Registered `/api/positions` router
- Accepts position ID, symbol, exchange, and exitPrice, delegates to `PositionManager.closePosition()`

### 2. Frontend Close Button
- **Modified:** `dashboard/src/pages/live-trading-page.tsx`
  - Added `id` and `symbol` fields to `PositionRow` interface
  - Added "Close" button column with red styling to the PositionsTable
  - Loading state: spinner animation + disabled button while closing
  - Success: position removed from list, toast "Position closed" (4s auto-dismiss)
  - Error: error toast, button re-enabled
  - Tracks closed position IDs via local state for optimistic UI removal
  - Uses `useApiClient` with POST `/positions/:id/close` and body `{ symbol, exchange, exitPrice }`

### 3. Fixes to Pre-existing Type Issues
- **Modified:** `dashboard/src/pages/live-trading-page.tsx` — Removed unused imports, added `useCallback`
- **Modified:** `dashboard/src/pages/reporting-page.tsx` — Exported `Trade` interface
- Dashboard now compiles with 0 TypeScript errors

### 4. Integration Tests
- **Created:** `dashboard/src/pages/__tests__/live-trading-page.test.tsx` — 29 tests covering:
  - Render tests: heading, mode badge, KPI cards, bot stats, positions section, trades section
  - Chart rendering: equity chart, strategy allocation, risk gauges
  - Empty states: "No open positions", "No trades yet", "No active strategies"
  - Loading state: "Refreshing..." indicator
  - Mode badge: LIVE vs PAPER modes
  - Close position: API call correctness, success toast, error toast, API failure, disabled state
  - Position removal: optimistic UI update after successful close
  - Stop bot: button visibility, confirmation dialog
  - Auto-refresh: Pause/Resume toggle

## Quality Gates
- `pnpm typecheck` in root: 0 errors
- `pnpm vitest run` in dashboard: 67 tests passed (6 test files)
- No `:any` types used
- No `console.log` in production code
- No existing routes broken (backward compatible)
