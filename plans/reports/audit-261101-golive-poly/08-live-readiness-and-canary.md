# 08 — Live Readiness & Canary Runbook (`audit-261101-golive-poly`)

## 1. Current Live Gate Status
- **Tier 1 (`G1-Soak` — Edge Persistence Soak):** **RUNNING (Day 1/30)** since `T0 = 2026-11-01T12:40:43.401Z` (`startedAt = 1793536843401`) on `algo-trader-staging` (Worker Version `1222ce87-907a-402d-87d6-10cb8172be4f`, commit `2512e432` / `src/` tree `3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`). Validates Edge Cron + KV `CACHE` + D1 `paper_trades_v3` durability only; does **not** satisfy Gate G2.
- **Gate G2 (`G2-Poly-Shadow` — 30-Day Real-Market Polymarket CLOB Shadow):** **BLOCKED / NOT STARTED (`0/30` days)**
- **PostgreSQL & Full SaaS End-to-End (`#5, #9-PG`):** **BLOCKED** (pending dedicated non-production Docker host and `001–007` migration + backup/restore drill evidence)
- **Gate G3 (Controlled Live Capital):** **BLOCKED**
- **`LIVE_TRADING_ENABLED`:** Unset / disabled across all local, CI, and staging environments (`getExecutionMode() === 'READ_ONLY'` by default; `PAPER_TRADING_ENABLED=true` on Edge Staging).

## 2. Two-Tier 30-Day Shadow Protocol Specification

### 2.1. Cohort Definition (Strategy / Config / Artifact)

| Dimension | Tier 1: `G1-Soak` (Edge Persistence Soak) | Tier 2: `G2-Poly-Shadow` (Polymarket Real-Market Shadow) |
| :--- | :--- | :--- |
| **Current State** | `RUNNING` (Day `1/30`, active on `algo-trader-staging`) | `BLOCKED / NOT STARTED` (`0/30` days accumulated) |
| **Validation Objective** | Prove 30-day durability of Cloudflare Cron, KV `CACHE` (`paper-trading-loop-state`), D1 `paper_trades_v3`, and `QWEN_KILL` circuit breaker without state corruption or KV/D1 drift. | Prove 30-day empirical edge on live Polymarket CLOB orderbook snapshots: top-of-book ask depth (`hasSufficientAskDepth`), spread persistence >1s, Leg-2 fill decay, compensatory IOC unwind (`exitPosition`), and zero `PolymarketOrderReconciler` drift. |
| **Strategy & Modules** | `PaperTradingLoop` (`src/desk/paper-trading/paper-trading-loop.ts`), `strategy = 'paper-loop'`, `source = 'paper-loop'` | `PolymarketArbStrategy` + `BasePolymarketStrategy` + `PolymarketOrderReconciler` in `PAPER` mode (`getExecutionMode() === 'PAPER'`, `LIVE_TRADING_ENABLED=false`) |
| **Market Data Feed** | Synthetic `basePriceForSymbol` + `simulatePriceTick` (±0.25% per tick) across `BTC/USD, ETH/USD, SOL/USD, AVAX/USD` | Live read-only Polymarket CLOB orderbook snapshots (`YES`/`NO` binary token pairs; zero live signing or order submission) |
| **Fixed Config Parameters** | `timeframe: '5m'`, `intervalMs: 60000`, `holdDurationMs: 60000`, `maxConcurrentTrades: 5`, `sizeUsd: 100`, `closureFee: 0.1%` (`$0.10`/closed trade) | `LIVE_TRADING_ENABLED = false`, `hasSufficientAskDepth = true`, `compensatoryIocUnwind = true`, market cooldown on Leg-2 failure, venue fee & partial-fill accounting enabled |
| **Artifact & Version Identity** | Worker `algo-trader-staging`, Version ID `1222ce87-907a-402d-87d6-10cb8172be4f`, commit `2512e432dec281e49fefbf03e08241e538ef46c1` (`src/` tree `3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`, `wrangler.toml` blob `2fae4b79a10938c18f53af97e2d456694b79c44b`), D1 `943fd11e-c81a-4342-afa6-7e80aa7a18df`, KV `1ef051223fde46629f0af6bf270e8315` | Must be pinned to an explicit commit SHA, `src/` tree hash, and runtime Version ID before `T0_G2` clock starts |

### 2.2. Start Time (`T0`) & 30-Day Window Rules
- **`T0` for `G1-Soak` (`T0_G1`):** `1793536843401` epoch ms = **`2026-11-01T12:40:43.401Z`** (`2026-11-01T19:40:43.401+07:00` `Asia/Saigon`), persisted in KV `state.startedAt`. Target 30-day completion (`T0_G1 + 720h`): **`2026-12-01T12:40:43.401Z`**.
- **`T0` for `G2-Poly-Shadow` (`T0_G2`):** **`TBD` (`0/30` days)**. The 30-day Gate G2 clock only starts when `PolymarketArbStrategy` + `PolymarketOrderReconciler` processes its first live Polymarket CLOB snapshot in `PAPER` mode with timestamped version identity.

### 2.3. Mandatory Telemetry Identity Envelope
Every telemetry snapshot recorded during the 30-day window must include:
1. `observedAtIso` (UTC ISO-8601) and `observedAtMs` (epoch ms).
2. `workerVersionId`: Active Cloudflare Worker Version ID (currently `1222ce87-907a-402d-87d6-10cb8172be4f`).
3. `sourceCommitSha` & `srcTreeHash`: Verified bundle commit (`2512e432` / `c842756f`) and `src/` git tree hash (`3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`), alongside `reportedStaticSecretSha` (`1fa01ca4b89eea4b88e335cdbf0e928da65c1142` until the next authorized secret sync).
4. `loopStartedAtMs`: `state.startedAt` (`1793536843401`) proving uninterrupted cohort continuity.

### 2.4. Missing-Data & Restart Rules
1. **Stateless Isolate Cold Start / Warm Restart (`< 15 min` gap, intact KV/D1 state):**
   - If `state.startedAt` (`1793536843401`) is unchanged, `tradeCounter` increases monotonically, and KV/D1 reconciliation drift is `0`, the 30-day clock continues without reset.
2. **Moderate External Outage (`15 min` to `< 4 hours` gap, intact KV/D1 state):**
   - If KV `startedAt` and D1 `paper_trades_v3` remain 100% reconciled (`drift = 0`), the run remains valid but the outage duration (minimum `+24h` penalty extension) is appended to the 30-day completion deadline.
3. **State Reset, Counter Rollback, or Extended Outage (`>= 4 hours` or KV state loss):**
   - If KV `paper-trading-loop-state` is lost (`startedAt` resets), `tradeCounter` regresses (`tradeCounter_t < tradeCounter_{t-1}`), or an outage reaches `>= 4 hours`, the active cohort is **INVALIDATED** and the 30-day clock resets to **Day `0/30`** after root-cause remediation.

### 2.5. Version-Change Rules
1. **Documentation / Audit-Only Commits (`plans/**`, `docs/**`, `*.md`):**
   - When `git rev-parse HEAD:src` (`3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`) and `wrangler.toml` blob hash (`2fae4b79a10938c18f53af97e2d456694b79c44b`) are unchanged (e.g., `2512e432` -> `c842756f`), no Worker redeploy is performed and the 30-day clock continues uninterrupted.
2. **Observability-Only Patch (Adding Read-Only Telemetry Fields / Syncing `COMMIT_SHA`):**
   - Allowed without resetting the 30-day clock **only if** execution/pricing/fee/reconciler logic is untouched, pre-deploy and post-deploy KV/D1 snapshots both verify `drift = 0`, `startedAt` is preserved, and a `Version Transition Marker` (`Version_Old -> Version_New`, timestamp, tree hash) is logged.
3. **Strategy, Execution, Sizing, Fee, or Reconciler Logic Change:**
   - Any code change to `PaperTradingLoop`, `PolymarketArbStrategy`, `BasePolymarketStrategy`, `PolymarketOrderReconciler`, or fee/PnL formulas **terminates the current cohort and resets the 30-day clock to `0/30` (`T0` reset)**.

### 2.6. Ledger, PnL & Fee Reconciliation Formulas

At every inspection timestamp $t$, all mathematical invariants below must hold simultaneously:

1. **Trade Counter & Row Count Invariant (`G1-Soak`):**
   $$\text{totalTrades}_{\text{KV}} = \text{openTrades}_{\text{KV}} + \text{closedTrades}_{\text{KV}} = \text{tradeCounter}_{\text{KV}}$$
   $$\text{closedTrades}_{\text{KV}} = \text{COUNT}(\text{rows in D1 } \texttt{paper\_trades\_v3}), \quad \text{openTrades}_{\text{KV}} \in [0, 5]$$

2. **Per-Trade Closure Fee & Realized PnL (`G1-Soak` — `src/desk/paper-trading/trade-executor.ts:44-69`):**
   - For notional $S_i = 100\text{ USD}$ and closure fee rate $f = 0.001$ ($0.1\%$):
     $$\text{feeUsd}_i = S_i \times 0.001 = 0.10\text{ USD}$$
     $$\text{rawPnlUsd}_i = \begin{cases} (P_{\text{exit}, i} - P_{\text{entry}, i}) \times \dfrac{S_i}{P_{\text{entry}, i}} & \text{if } \text{side}_i \in \{\texttt{BUY}, \texttt{YES}\} \\[8pt] (P_{\text{entry}, i} - P_{\text{exit}, i}) \times \dfrac{S_i}{P_{\text{entry}, i}} & \text{if } \text{side}_i \in \{\texttt{SELL}, \texttt{NO}\} \end{cases}$$
     $$\text{pnlUsd}_i = \text{rawPnlUsd}_i - \text{feeUsd}_i$$

3. **Zero-Drift KV <-> D1 Cumulative PnL Invariant (`G1-Soak`):**
   $$\Delta_{\text{KV-D1}} = \left| \text{totalPnlUsd}_{\text{KV}} - \sum_{i=1}^{\text{closedTrades}} \text{pnl}_{\text{D1}, i} \right| \le 10^{-6}\text{ USD}$$
   *(Verified live at `2026-11-02T02:45:00.823Z`: KV at 62 closed trades had `totalPnlUsd = -5.125484106260158`; trade #63 `paper-1793583943390-63` on `AVAX/USD` closed with `pnl = -0.06819488649564752`, bringing D1 `COUNT(*) = 63` and `SUM(pnl) = -5.193679`, matching `-5.125484106260158 + (-0.06819488649564752) = -5.1936789927558055` with $\Delta \approx 7.24 \times 10^{-9}\text{ USD} \le 10^{-6}\text{ USD}$).*

4. **Multi-Leg Arbitrage, Partial-Fill & Reconciler Invariant (`G2-Poly-Shadow`):**
   - Full two-leg fill ($Q_{\text{YES}} = Q_{\text{NO}} = Q$):
     $$\text{netPnlUsdc} = Q \times \left(1.00 - (P_{\text{ask, YES}} + P_{\text{ask, NO}})\right) - (\text{venueFee}_{\text{YES}} + \text{venueFee}_{\text{NO}})$$
   - Unhedged Leg-1 compensatory IOC unwind ($P_{\text{unwind}}$):
     $$\text{netPnlUsdc}_{\text{unwind}} = Q_{\text{filled}, 1} \times (P_{\text{unwind}} - P_{\text{entry}, 1}) - (\text{venueFee}_{\text{entry}, 1} + \text{venueFee}_{\text{unwind}})$$
   - Deterministic Reconciler Invariant (`src/desk/execution/polymarket-order-reconciler.ts`):
     $$\text{unexplainedDriftUsdc} = 0, \quad \text{stalledUnknownOrdersCount} = 0$$

### 2.7. Stop & Emergency Kill Conditions (`L0–L3`)
Immediately halt the shadow cohort and trigger the corresponding kill switch if any condition occurs:
1. **Execution Mode Violation (`L0`):** `getExecutionMode() === 'LIVE'` or `LIVE_TRADING_ENABLED === 'true'` detected in any shadow/staging environment -> unset `LIVE_TRADING_ENABLED` immediately and invalidate cohort.
2. **Drawdown or Kill-Switch Trip (`L1`):** `killed === true` on `/api/v1/paper-trading/status`, `QWEN_KILL === '1'`, or simulated daily drawdown exceeds `maxDailyDrawdown > 0.05` (`5%`).
3. **Accounting Drift (`L1/L2`):** $\Delta_{\text{KV-D1}} > 10^{-6}\text{ USD}$, $\text{closedTrades}_{\text{KV}} \neq \text{COUNT}(\text{paper\_trades\_v3})_{\text{D1}}$ persisting past 1 cron cycle (`60s`), or `unexplainedDriftUsdc !== 0`.
4. **Unresolved `UNKNOWN` Order State or Leg-2 Unwind Failure (`L2` — `G2-Poly-Shadow`):** Any order remains in `UNKNOWN` state past 1 reconciliation cycle (triggering market lock), or compensatory IOC `exitPosition` fails to unwind an unhedged Leg-1 fill within 1 tick -> invoke `LiveTradingOrchestrator.stop()`.
5. **Edge Worker Health Regression (`L3`):** HTTP `5xx` on `/health`, `/api/health`, or `/api/v1/paper-trading/status` -> execute `npx wrangler rollback --config wrangler.toml`.
