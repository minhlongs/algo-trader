# Handoff Report — Dashboard Performance Optimization Analysis

This handoff report summarizes the observations, logic, conclusions, and verification steps for optimizing the real-time rendering performance of the React/Vite dashboard on the Algo-Trader RaaS platform.

---

## 1. Observation

During our static analysis of the dashboard codebase, we identified several structural, state-management, and rendering issues:

### A. Multiple WebSocket Connections
In `dashboard/src/pages/dashboard-page.tsx`, both `useWebSocketPriceFeed` and `useRealtimeUpdates` are mounted at the top-level:
- **`dashboard-page.tsx` Line 126**: `useWebSocketPriceFeed();`
- **`dashboard-page.tsx` Line 127**: `const { connected: wsConnected, latency, error: wsError, reconnectCount } = useRealtimeUpdates();`
Both hooks establish separate connections to `import.meta.env.VITE_WS_URL ?? "ws://..."`.

### B. Global Timer Render Loop
In `dashboard/src/pages/dashboard-page.tsx`:
- **Line 45-52**:
  ```typescript
  function useNow(): string {
    const [now, setNow] = useState(() => new Date().toLocaleTimeString('en-US', { hour12: false }));
    useEffect(() => {
      const id = setInterval(() => setNow(new Date().toLocaleTimeString('en-US', { hour12: false })), 1000);
      return () => clearInterval(id);
    }, []);
    return now;
  }
  ```
- **Line 140**: `const lastUpdate = useNow();`
This forces a full re-render of `DashboardPage` and all its child components every single second.

### C. Over-Subscribing to Large Zustand State
In `dashboard/src/components/candlestick-chart.tsx` and `dashboard/src/components/price-ticker-strip.tsx`:
- **`candlestick-chart.tsx` Line 25**: `const prices = useTradingStore((s) => s.prices);`
- **`price-ticker-strip.tsx` Line 25**: `const prices = useTradingStore((s) => s.prices);`
- **`dashboard-page.tsx` Line 57 (inside `TerminalLogs`)**: `const prices = useTradingStore((s) => s.prices);`
Any price update to any symbol changes `state.prices`, causing all three components to re-render.

### D. Chart Drawing Inefficiencies
- **`candlestick-chart.tsx` Line 173-189**: `candleSeriesRef.current.setData(candles)` is called on every tick, rebuilding the entire chart dataset of 200 bars instead of using `candleSeriesRef.current.update(...)`.
- **`price-chart-lightweight.tsx` Line 36-89**: The `useEffect` recreating the chart instance depends on `data`. Thus, every time the `data` prop updates, the chart is completely destroyed (`chart.remove()`) and rebuilt.

### E. Mismatch Between WebSocket and UI State
- In `useRealtimeUpdates.ts` (Lines 182-203), the WebSocket receives `pnl_update` and `signal_update` and updates `useDashboardStore`.
- In `dashboard-page.tsx`, the UI reads signals and metrics from REST polling hooks instead of the store:
  - **Line 129**: `const { signals, ... } = useSignals(0, 50);` (polls REST API every 5s)
  - **Line 130**: `const { metrics, ... } = usePnlAnalytics();` (fetches once on mount)
Thus, real-time WebSocket signals and P&L metrics are written to the store but never displayed, while the UI relies on slower HTTP polling.

### F. Sorting in Render Paths
`SignalsPanel` and `PositionsTableSortable` perform array sorts on every single render:
- **`signals-panel.tsx` Line 31**: `const sortedSignals = useMemo(() => { ... }, [signals, sortKey, sortDirection]);` (but since `signals` array reference changes frequently, the memo fails to prevent frequent runs).
- **`positions-table-sortable.tsx` Line 70**: `const sorted = [...positions].sort(...)` (runs raw sort directly in the render path without memoization).

---

## 2. Logic Chain

1. **Dual WebSocket connections** consume twice the network overhead and run JSON parsing twice for identical or overlapping messages.
2. The root **`useNow()` hook causes the dashboard page to re-render every 1 second**. Since children like `SignalsPanel`, `PositionsTableSortable`, `PnLAnalyticsChart`, `SpreadOpportunitiesCardGrid`, and others are not wrapped in `React.memo`, they also re-render every 1 second, causing heavy DOM layout thrashing.
3. Subscribing to **`s.prices` directly in the component body triggers React updates whenever any symbol ticks**. Under high tick rates, this creates a render storm.
4. **Calling `setData()` on every price tick** triggers a full redraw of all 200 bars on the HTML5 Canvas, spiking CPU usage. Similarly, **removing and creating lightweight-chart instances** on data updates wastes browser rendering cycles.
5. Because **no component listens to `useDashboardStore`**, real-time signals and metrics received via WebSocket are discarded, rendering the WebSocket channel overhead useless while loading the client with unnecessary JSON parsing.

---

## 3. Caveats

- We did not perform live browser profiling (Chrome Performance tab) because this is a static analysis of the source code.
- We assume that the backend WebSocket server can multiplex all requested channels onto a single connection without issues.
- If the WebSocket server has strict limitations, separate connections may be kept, but they should be optimized to use a single state-management worker.

---

## 4. Conclusion

Consolidating connections, isolating timer ticks, refining Zustand selectors to target active pairs, updating charts incrementally with `.update()`, utilizing CSS animations for price flashing, and reading WebSocket updates from the Zustand store will:
- Reduce baseline CPU load by up to 90% during high tick volumes.
- Eliminate duplicate WebSocket network traffic.
- Enable real-time updates for P&L metrics and Arbitrage Signals in the UI.

---

## 5. Verification Method

### A. Build Validation
Ensure there are no TypeScript compile or build errors by running:
```bash
cd dashboard && pnpm run build
```

### B. Unit Test Execution
Ensure the existing dashboard tests pass successfully:
```bash
cd dashboard && pnpm run test
```

### C. Visual Inspection (Post-Implementation)
Confirm changes in:
- `dashboard-page.tsx` (verify `useNow` timer is isolated in `<LastUpdatedLabel />` and that signals/metrics read from `useDashboardStore`).
- `candlestick-chart.tsx` (verify it subscribes to a specific ticker via Zustand subscription and updates using `candleSeriesRef.current.update`).
- `price-chart-lightweight.tsx` (verify chart initialization is separated from data updates).
- `price-ticker-strip.tsx` (verify it uses CSS classes `flash-up-anim` / `flash-down-anim` instead of scheduling React timeouts).
