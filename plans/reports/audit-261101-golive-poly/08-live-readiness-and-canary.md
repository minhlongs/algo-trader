# 08 — Live Readiness & Canary Runbook (`audit-261101-golive-poly`)

## 1. Current Live Gate Status
- **Gate G2 (Shadow / Micro-Live Canary):** **BLOCKED**
- **Gate G3 (Controlled Live Capital):** **BLOCKED**
- **`LIVE_TRADING_ENABLED`:** Unset / disabled across all local, CI, and staging environments (`getExecutionMode() === 'READ_ONLY'` by default; `PAPER_TRADING_ENABLED=true` on Edge Staging).

## 2. Prerequisites to Unlock Gate G2 (Shadow -> Micro-Canary)
1. **30-Day Real-Market Shadow / Paper Telemetry:**
   - Run `PaperTradingLoop` and `PolymarketArbStrategy` against live Polymarket CLOB orderbook snapshots in `PAPER` mode for 30 days.
   - Verify empirical distribution of top-of-book ask depth, spread persistence across >1s latency, and simulated Leg-2 fill decay.
2. **Zero Accounting Drift & Zero `UNKNOWN` Order Stalls:**
   - `PolymarketOrderReconciler.reconcile().unexplainedDriftUsdc === 0` across all shadow sessions.
3. **Explicit Operator Sign-Off:**
   - Written owner approval specifying the dedicated canary wallet, maximum capital cap (`capitalUsdc <= $100`), `maxPositionFraction <= 0.02`, and `maxDailyDrawdown <= 0.05`.

## 3. Emergency Kill & Rollback Hierarchy (`L0–L4`)
- **L0 (Process / Mode Gate):** Unset `LIVE_TRADING_ENABLED` (or set `LIVE_TRADING_ENABLED=false`) and restart process -> `requireLiveEnabled()` immediately blocks all 6 live order entrypoints.
- **L1 (Edge Kill Switch):** `QWEN_KILL=1` secret/KV flag (`src/desk/wiring/qwen-drawdown-monitor.ts`).
- **L2 (Orchestrator Stop):** `LiveTradingOrchestrator.stop()` -> cancels all active CLOB orders via `LiveOrderManager.stop()` and persists state.
- **L3 (Worker Version Rollback):** `npx wrangler rollback --config wrangler.toml`.
