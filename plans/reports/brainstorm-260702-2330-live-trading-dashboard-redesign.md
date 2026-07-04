# Brainstorm: Live Trading Dashboard Redesign

**Date:** 2026-07-02 23:30 | **Mode:** Stitch → frontend-design → ui-styling → parallel cook
**Status:** design approved (user approved design, Stitch unavailable)

---

## Problem

The `/app/live-trading` page (351 lines) is functional but terminal-style: raw tables, no charts, no auto-refresh, no risk visualization, desktop-only. It doesn't provide the real-time trading cockpit experience a subscriber expects.

---

## Design: Terminal Trading Cockpit

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ 🟢 LIVE  │  Live Trading  │  5s auto-refresh  [Stop Bot]    │
├──────────────┬──────────────┬──────────────┬──────────────────┤
│  Daily P&L    │  Win Rate    │  Open Pos     │  Circuit Breaker │
│  +$2,540      │  68%         │  3 pos        │  ● CLOSED        │
│  ▲ +12.3% 7d  │  ▲ +5% 7d    │  2 strategies │  Risk: 23%       │
│  [sparkline]  │  [sparkline] │  [sparkline]  │  [sparkline]     │
├──────────────┴────────────────────────────────────────────────┤
│  P&L Equity Curve   [7d ●] [30d ○] [All ○]                   │
│  ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲                            │
│  ╱    ╲    ╱╲    ╱    ╲    ╱╲    ╱╲   ▲ +$2,540 ↓ -$320    │
├───────────────────────┬──────────────────────────────────────┤
│  Strategy Allocation   │  Risk Dashboard                      │
│  ┌─────────────────┐   │  Daily Loss:  ████░░░░░░  23%  ⚠️    │
│  │ ○ Bollinger  40% │   │  Position:    ██░░░░░░░░  12%  ✅   │
│  │ ○ VolTarget  30% │   │  Drawdown:    █░░░░░░░░░   8%  ✅   │
│  │ ○ InfoAsym   20% │   │  Consec:      ██░░░░░░░░   2   ✅   │
│  │ ○ LiqMig     10% │   │  Capital:     ████████░░  80%  ✅   │
│  └─────────────────┘   └──────────────────────────────────────┘
├──────────────────────────────────────────────────────────────┤
│  Open Positions (3)                              [+ Close All]│
│  Token │ Side │ Size  │ Entry   │ Current  │ PnL      │ Action│
│  BTC   │ LONG │ 0.5   │ $68,420 │ $71,150  │ +$1,365  │ [X]   │
│  ETH   │ SHORT│ 2.0   │ $3,420  │ $3,180   │ +$480    │ [X]   │
├──────────────────────────────────────────────────────────────┤
│  Recent Trades (47)                                       [→]│
│  Time     │ Strategy │ Side │ Price │ Size │ PnL      │ Mode  │
│  23:15:22 │ Bollinger │ BUY  │ 0.85  │ 100  │ +$12.50  │ PAPER │
│  23:12:01 │ VolTarget │ SELL │ 0.32  │ 50   │ -$3.20   │ PAPER │
└──────────────────────────────────────────────────────────────┘
```

### Key Changes from Current

| Aspect | Before | After |
|--------|--------|-------|
| Charts | None | Equity curve area chart (7d/30d/all), sparkline KPI cards |
| Risk view | Single circuit breaker line | Full risk dashboard: 5 gauges with thresholds + warning icons |
| Strategy allocation | None | Donut chart (recharts) |
| Auto-refresh | Manual "Refresh" button | 5s WebSocket polling, pulsing indicator |
| Position actions | None | Close button per position |
| Mobile | Desktop-only (min-width tables) | Responsive: cards stack, tables horizontal scroll |
| Stop bot | Via CLI only | Red button in header with confirmation |

### Tech Stack

- **Chart library:** Recharts (already used in `strategy-performance-page.tsx`)
- **Styling:** Tailwind CSS (existing dashboard pattern)
- **Data flow:** WebSocket (existing `useRealtimeUpdates` hook + polling fallback)
- **Icons:** @phosphor-icons/react (existing)

---

## Implementation Phases

| Phase | What | Effort | Files |
|-------|------|--------|-------|
| **1** | Equity curve chart + KPI sparklines | 2h | `live-trading-page.tsx`, new chart component |
| **2** | Risk dashboard gauges | 1.5h | New `risk-gauges.tsx` component |
| **3** | Strategy allocation donut | 1h | Inline or new component |
| **4** | Auto-refresh + stop bot button | 1h | `live-trading-page.tsx` |
| **5** | Position close buttons | 1h | `live-trading-page.tsx` + API call |
| **6** | Mobile responsive | 1h | CSS/Tailwind adjustments |
| **7** | Integration + tests | 1h | Test updates |

---

## Files to Touch

| File | Action |
|------|--------|
| `dashboard/src/pages/live-trading-page.tsx` | MODIFY — full rewrite |
| `dashboard/src/components/trading-equity-chart.tsx` | CREATE — equity curve chart |
| `dashboard/src/components/risk-dashboard-gauges.tsx` | CREATE — risk gauges |
| `dashboard/src/components/strategy-allocation-chart.tsx` | CREATE — donut chart |
| `dashboard/src/components/trading-kpi-card.tsx` | CREATE — KPI card with sparkline |
| `dashboard/src/hooks/use-live-trading-websocket.ts` | CREATE OR MODIFY — auto-refresh hook |

---

## Success Criteria

- [ ] Equity curve chart renders with 7d/30d/all toggle
- [ ] KPI cards show sparkline trend indicators
- [ ] Risk dashboard shows all 5 gauges with threshold warnings
- [ ] Strategy allocation donut chart renders from position data
- [ ] Auto-refresh updates data every 5s
- [ ] Stop Bot button works with confirmation dialog
- [ ] Position close buttons call API and update state
- [ ] All states: loading, empty, error, populated
- [ ] Responsive on mobile (320px+)
- [ ] 0 TS errors, all tests pass
