## 2026-05-30T07:06:50Z
**Context**: Optimize dashboard real-time rendering performance for the Algo-Trader RaaS platform.
**Identity**:
- Type: teamwork_preview_worker
- Working Directory: /Users/macbook/algo-trader/.agents/teamwork_preview_worker_dashboard_opt
- Scope: /Users/macbook/algo-trader/.agents/orchestrator/PROJECT.md

**Objective**:
Implement the frontend dashboard optimizations:
1. Consolidate WebSocket connections: Update `dashboard/src/hooks/use-dashboard-websocket.ts` to replace redundant connections from other hooks. Implement a 100ms buffering strategy for price ticks and a snapshot-overwriting buffer for P&L, signals, positions, trades, and other updates. Ensure it populates both `useTradingStore` and `useDashboardStore`.
2. Optimize `dashboard/src/pages/dashboard-page.tsx`:
   - Mount only the unified `useDashboardWebSocket` hook and remove references to `useWebSocketPriceFeed` and `useRealtimeUpdates`.
   - Isolate the `useNow()` timer logic into a standalone, memoized `<LastUpdatedLabel />` sub-component so that time updates do not force the main `DashboardPage` to re-render.
   - Refactor components to read metrics and signals directly from Zustand stores (`useDashboardStore`) instead of relying on REST API polling.
3. Optimize `dashboard/src/components/candlestick-chart.tsx`:
   - Refine the Zustand subscription: subscribe selectively to `useTradingStore((s) => s.prices[activePair])` or utilize Zustand's `useTradingStore.subscribe` function to listen to specific ticker updates.
   - Update the lightweight chart series using `candleSeriesRef.current.update` instead of `setData` on every tick.
4. Optimize `dashboard/src/components/price-chart-lightweight.tsx`:
   - Separate chart creation from data updating: initialize the lightweight chart instance once in a `useEffect` on mount, and update the series data in a separate `useEffect` depending on the `data` prop, rather than destroying and recreating the chart instance on every update.
5. Optimize Tickers & Rendering lists:
   - In `dashboard/src/components/price-ticker-strip.tsx`, use CSS keyframe animations (`flash-up-anim` / `flash-down-anim` styling rules in the global CSS) to fade out price flash changes instead of scheduling React state timeouts.
   - Limit visible signals in `dashboard/src/components/signals-panel.tsx` (using slicing/top-N display) and wrap tables in `React.memo` to protect the DOM.
6. Verify that the dashboard builds successfully (`cd dashboard && npm run build` or similar) and all unit/frontend tests pass 100%.

**MANDATORY INTEGRITY WARNING**:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

**Output Requirements**:
Write a detailed handoff report to `/Users/macbook/algo-trader/.agents/teamwork_preview_worker_dashboard_opt/handoff.md` detailing:
1. Files modified and specific code changes.
2. Build and test execution commands and outcomes.
3. Test success verification logs.

**Completion Criteria**:
TypeScript compilation succeeds and unit and integration tests pass 100%. Handoff report is written to the specified path and a message is sent back to orchestrator (conversation ID: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6).
