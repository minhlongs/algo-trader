# BRIEFING — 2026-05-30T07:06:40Z

## Mission
Analyze React/Vite dashboard rendering bottlenecks and propose optimizations for real-time WebSocket traffic.

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: Teamwork explorer (read-only investigation)
- Working directory: /Users/macbook/algo-trader/.agents/teamwork_preview_explorer_dashboard_opt
- Original parent: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6
- Milestone: Dashboard Performance Optimization

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Analyze dashboard/src/components/candlestick-chart.tsx, price-chart-lightweight.tsx, signals-panel.tsx, pages/dashboard-page.tsx
- Do not modify source code directly; propose changes in analysis.md and handoff.md

## Current Parent
- Conversation ID: fae0d5e9-2837-4ae7-9b5b-a6197e0b53c6
- Updated: 2026-05-30T07:06:40Z

## Investigation State
- **Explored paths**:
  - `dashboard/src/pages/dashboard-page.tsx`
  - `dashboard/src/components/candlestick-chart.tsx`
  - `dashboard/src/components/price-chart-lightweight.tsx`
  - `dashboard/src/components/signals-panel.tsx`
  - `dashboard/src/components/price-ticker-strip.tsx`
  - `dashboard/src/components/positions-table-sortable.tsx`
  - `dashboard/src/components/spread-opportunities-card-grid.tsx`
  - `dashboard/src/hooks/use-realtime-updates.ts`
  - `dashboard/src/hooks/use-websocket-price-feed.ts`
  - `dashboard/src/hooks/use-signals.ts`
  - `dashboard/src/hooks/use-pnl-analytics.ts`
  - `dashboard/src/stores/trading-store.ts`
  - `dashboard/src/stores/dashboard-store.ts`
- **Key findings**:
  - Root cause of re-render loops: `useNow()` timer re-renders the root page every second.
  - Store over-subscription: subscribing to entire `prices` object triggers render storms.
  - Double connections: parallel WebSockets open to same endpoint.
  - Inefficient chart canvas writes: calling `.setData()` instead of `.update()` on ticks; recreating chart instances.
  - Store update mismatch: WebSocket writes to Zustand but UI polls HTTP REST APIs.
- **Unexplored areas**: None.

## Key Decisions Made
- Suggested single consolidated WebSocket hook (`useDashboardWebSocket`).
- Suggested isolating `useNow` into `<LastUpdatedLabel />`.
- Suggested direct out-of-band canvas updates (`candleSeries.update()`) to remove chart states from React.
- Suggested CSS animations to remove Javascript timers from price flashes.
- Suggested list virtualization and `React.memo` wrapping.

## Artifact Index
- /Users/macbook/algo-trader/.agents/teamwork_preview_explorer_dashboard_opt/analysis.md — Detailed performance analysis and proposed optimization snippets
- /Users/macbook/algo-trader/.agents/teamwork_preview_explorer_dashboard_opt/handoff.md — Handoff report with observations, logic chain, caveats, conclusion, and verification method
