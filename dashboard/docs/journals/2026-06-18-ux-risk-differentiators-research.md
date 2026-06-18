# UX & Risk Differentiators: algo-trader vs Typical Polymarket Bots

**2026-06-18** | Research complete

---

## Executive Summary

algo-trader delivers **enterprise-grade risk management** missing from typical Polymarket bots:

- **Visual risk** (gauge, heatmap, sparkline)
- **Proactive controls** (auto-close, circuit breaker)
- **Decision aids** (what-if, confidence scores)
- **Smart alerts** (severity-based toasts)
- **Custom preferences** (localStorage)

Backed by Kelly sizer, HTTP/2 pooling, and Negative Risk Scanner, algo-trader supports **autonomous 24/7 operation**.

---

## 1. Risk Visualization

**Typical bots:** Text-only P&L, raw order books. Users calculate exposure manually.

**algo-trader:**
- **RiskGauge**: Semi-circle gauge (0-100%) with color zones. Instant risk level.
- **ExposureHeatmap**: Grid of positions; color intensity = size, border = long/short.
- **PnlSparkline**: Real-time P&L trend with risk zone markers.

*Files: `dashboard/src/components/ui/risk-gauge.tsx`, `exposure-heatmap.tsx`, `pnl-sparkline.tsx`*

---

## 2. Proactive Risk Controls

**Typical bots:** Manual stop-loss only. No automation.

**algo-trader:**

**Auto-Close Rules**
- Profit target %, stop loss %, trailing stop %
- Integrated with NegRiskScanner store

**Circuit Breaker**
- Loss streak (default 3)
- Daily drawdown (default 5%)
- Latency/volatility thresholds
- Cooldown, state machine (CLOSED/OPEN/HALF_OPEN)

*Backend: `src/risk/circuit-breaker.ts`, `drawdown-monitor.ts`*  
*Frontend: `components/risk/auto-close-form.tsx`, `circuit-breaker-form.tsx`, `ProactiveControlsPanel.tsx`*

---

## 3. Decision Aids

**Typical bots:** Raw signals without context. No sizing guidance.

**algo-trader:**

**What-If Calculator**
- Position size → profit/loss estimates, risk/reward
- Real-time using user's configured targets

**Confidence Scores**
- Per-signal indicator (last 20 trades win rate)
- Color-coded: green (>70%), yellow (40-70%), red (<40%)

*Files: `components/risk/WhatIfCalculator.tsx`, `ConfidenceScore.tsx`, `DecisionAidsPanel.tsx`*

---

## 4. Alerts & Notifications

**Typical bots:** Console logs or email (high latency). Equal priority for all.

**algo-trader:**

**Toast System**
- Stackable, non-blocking
- Severity: info/warning/error/critical
- Auto-dismiss; critical persists
- Action buttons

**Preferences**
- Channels: toast, email, sound
- Severity threshold filter

*Files: `stores/notifications-store.ts`, `components/notifications/ToastContainer.tsx`, `ToastItem.tsx`, `NotificationPreferencesForm.tsx`*

---

## 5. Customizable Dashboard

**Typical bots:** Fixed layout, no preferences beyond API keys.

**algo-trader:**
- **RiskPreferencesStore** (Zustand + localStorage)
- Controls: auto-close params, circuit breaker thresholds, alert channels, widget visibility/ordering, confidence threshold

*Files: `stores/risk-preferences-store.ts`, `pages/risk-settings-page.tsx`*

---

## Backend Differentiators

### Kelly Position Sizer
- Kelly criterion + quarter-Kelly default
- Max position cap (5%)
- **Correlation adjustment**
- Managed capital safeguard

*File: `src/risk/kelly-position-sizer.ts`*

### HTTP/2 Connection Pool
- DNS caching (TTL 5min)
- Connection multiplexing
- Pre-warming, auto-reconnection
- 50-70% latency reduction; 10,000+ RPS

*File: `src/execution/http2-connection-pool.ts`*

### Negative Risk Scanner
- Scans for YES+NO sum < 0.98
- Risk-free arbitrage detection
- Real-time order book analysis

*Files: `src/strategies/polymarket/negative-risk-scanner.ts`, `dashboard/src/pages/neg-risk-dashboard-page.tsx`*

---

## Comparison Matrix

| Feature | Typical Bot | algo-trader |
|---------|-------------|-------------|
| Risk viz | None | Gauge, Heatmap, Sparkline |
| Auto-close | Manual only | Automated, configurable |
| Circuit breaker | No | Yes (loss streak, drawdown, latency) |
| What-if calculator | No | Yes (real-time) |
| Confidence scores | No | Yes (history-based) |
| Alert prioritization | No | Severity levels, channels |
| Dashboard customization | No | Preferences store |
| Position sizing | Fixed | Kelly + correlation |
| Connection pooling | No | HTTP/2 with DNS cache |
| Arbitrage detection | No | Negative Risk Scanner |

---

## Implementation Status

**All 6 UX phases completed:** RiskPreferencesStore, visualization components (3), ProactiveControlsPanel, DecisionAidsPanel, notifications system, dashboard integration.

**Backend:** Kelly sizer, HTTP/2 pool, Negative Risk Scanner, circuit breaker—all implemented.

---

## Gaps & Improvements

**Medium:**
- Correlation model (use covariance matrix)
- Confidence score sophistication (add signal strength, volatility)
- Latency monitoring (continuous p95 tracking)
- Heatmap scalability (virtualize >50 positions)

**Low:**
- What-if advanced modes (volatility scenarios)
- Notification sound customization per severity

---

## Competitive Context

**Polymarket Agents** (official): Educational prototype.
- No backtesting, monitoring, automated risk
- Polling-based, single-LLM lock-in
- No RaaS infrastructure

**algo-trader:** Enterprise-grade.
- 43+ strategies, 19 agents, $2,251+ live P&L proof
- 4,477+ tests, Grafana monitoring, RaaS billing

---

## Conclusion

algo-trader's UX/risk suite transforms it from a CLI tool into a **commercial-grade product**. Intuitive visualizations, proactive automation, and decision support—backed by robust infrastructure—create a defensible moat.

**Next:** Evolve to predictive analytics (Monte Carlo simulation, portfolio drawdown forecasting).

---

**Sources:** Codebase (`dashboard/src`, `src/risk`, `src/execution`), plans (`dashboard/plans/20250618-ux-risk-differentiators/`), benchmark (`docs/benchmark-cashclaw-vs-polymarket-agents.md`)
