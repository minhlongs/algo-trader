# 08 — Live Readiness & Canary Runbook (`audit-261101-golive-poly`)

## 1. Current Live Gate Status
- **Tier 1 (`G1-Soak` — Edge Persistence Soak):** **RUNNING (Day 6/30)** since `T0 = 2026-11-01T12:40:43.401Z` (`startedAt = 1793536843401`) on `algo-trader-staging` (Worker Version `1222ce87-907a-402d-87d6-10cb8172be4f`, commit `2512e432` / `src/` tree `3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`). At Day 6 (`2026-11-07`), `closedTrades = 663`, `openTrades = 5`, `tradeCounter = 668`, `KV totalPnlUsd = -62.257087824102896` vs `D1 SUM(pnl) = -62.25708782410294` ($\Delta \approx 4.26 \times 10^{-14}\text{ USD}$, zero drift). Validates Edge Cron + KV `CACHE` + D1 `paper_trades_v3` durability only; does **not** satisfy Gate G2.
- **Gate G2 (`G2-Poly-Shadow` — 30-Day Real-Market Polymarket CLOB Shadow):** **RUNNING (Day 1/30; Sign-Off BLOCKED until 30/30 Days)** since `T0_G2 = 1794047000444` (`2026-11-07T09:03:20.444Z`, target 30-day completion `2026-12-07T09:03:20.444Z`), initiated via `scripts/run-g2-poly-shadow-probe.ts` in `PAPER` mode (`LIVE_TRADING_ENABLED=false`) against live Polymarket Gamma + CLOB snapshots (`liveMarketsFetched: 5`, `liveOrderBooksFetched: 6`, `3` probe cycles, `6` cumulative fills, `positionsByToken: {"g2-yes-token-1": 63, "g2-no-token-1": 60}`, `cashUsdc: 940.8530632`, `totalFeesUsdc: 0.1369368`, `unexplainedDriftUsdc: 0`, `unknownOrderCount: 0`, `version_transition` marker logged from `0996c20c -> 04ed0660`).
- **PostgreSQL & Full SaaS End-to-End (`#5, #9-PG`):** **VERIFIED / PASS (`Issue #240`)** (executed against local PostgreSQL `15.17 (Homebrew)`, `algo_trader_staging` & `algo_trader_staging_restored`; `m1pro-home` untouched: `51/51` migrations applied, rollback `048-prediction-history` + re-apply `51/51` verified, `pg_dump`/`pg_restore` `RTO = 441.15 ms`, `RPO = 0 rows`, `totalDriftRows = 0` across 7 tables)
- **Gate G3 (Controlled Live Capital):** **BLOCKED**
- **`LIVE_TRADING_ENABLED`:** Unset / disabled across all local, CI, and staging environments (`getExecutionMode() === 'READ_ONLY'` by default; `PAPER_TRADING_ENABLED=true` on Edge Staging and `PAPER` mode on `G2-Poly-Shadow`).

## 2. Two-Tier 30-Day Shadow Protocol Specification

### 2.1. Cohort Definition (Strategy / Config / Artifact)

| Dimension | Tier 1: `G1-Soak` (Edge Persistence Soak) | Tier 2: `G2-Poly-Shadow` (Polymarket Real-Market Shadow) |
| :--- | :--- | :--- |
| **Current State** | `RUNNING` (Day `6/30`, active on `algo-trader-staging`, `663` closed trades, `0` drift) | `RUNNING` (Day `1/30` initiated at `T0_G2 = 1794047000444`, `3` probe cycles / `6` fills, `0` drift; Gate G2 sign-off `BLOCKED` until `30/30` days) |
| **Validation Objective** | Prove 30-day durability of Cloudflare Cron, KV `CACHE` (`paper-trading-loop-state`), D1 `paper_trades_v3`, and `QWEN_KILL` circuit breaker without state corruption or KV/D1 drift. | Prove 30-day empirical edge on live Polymarket CLOB orderbook snapshots: top-of-book ask depth (`hasSufficientAskDepth`), spread persistence >1s, Leg-2 fill decay, compensatory IOC unwind (`exitPosition`), and zero `PolymarketOrderReconciler` drift. |
| **Strategy & Modules** | `PaperTradingLoop` (`src/desk/paper-trading/paper-trading-loop.ts`), `strategy = 'paper-loop'`, `source = 'paper-loop'` | `PolymarketArbStrategy` + `BasePolymarketStrategy` + `StrategyRunner` (live state getters, `executeStrategyTick` risk gate, `clobClient` & `GammaClientImpl` JSON-string parser wired via `createRunnerStrategyDeps`) + `LiveOrderManagerProxy` + `LiveTradingOrchestrator` (`paper-orderbook-simulator.ts` CLOB depth sweep + `PaperLegDecayTracker` + dual-ledger `LivePositionTracker`/`PolymarketOrderReconciler`/`LiveTradingJournal` sync + `~/.cashclaw/` atomic persistence, `allowCohortContinuation` & `version_transition` JSONL telemetry envelope in `g2-shadow-telemetry.ts`) in `PAPER` mode (`getExecutionMode() === 'PAPER'`, `LIVE_TRADING_ENABLED=false`, `PR #230`, `PR #232`, `PR #239`, `Issue #240`) |
| **Market Data Feed** | Synthetic `basePriceForSymbol` + `simulatePriceTick` (±0.25% per tick) across `BTC/USD, ETH/USD, SOL/USD, AVAX/USD` | Live read-only Polymarket Gamma + CLOB orderbook snapshots (`YES`/`NO` binary token pairs; zero live signing or order submission) |
| **Fixed Config Parameters** | `timeframe: '5m'`, `intervalMs: 60000`, `holdDurationMs: 60000`, `maxConcurrentTrades: 5`, `sizeUsd: 100`, `closureFee: 0.1%` (`$0.10`/closed trade) | `LIVE_TRADING_ENABLED = false`, `hasSufficientAskDepth = true`, `compensatoryIocUnwind = true`, market cooldown on Leg-2 failure, venue fee & partial-fill accounting enabled, `allowCohortContinuation = true` (zero-drift required) |
| **Artifact & Version Identity** | Worker `algo-trader-staging`, Version ID `1222ce87-907a-402d-87d6-10cb8172be4f`, commit `2512e432dec281e49fefbf03e08241e538ef46c1` (`src/` tree `3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`, `wrangler.toml` blob `2fae4b79a10938c18f53af97e2d456694b79c44b`), D1 `943fd11e-c81a-4342-afa6-7e80aa7a18df`, KV `1ef051223fde46629f0af6bf270e8315` | Initialized at `0996c20cfda4e82ebdd8ce03eb253a308615d24c` (`f9f4e6527a5d07c3bbcd66f711f719971b7e5330`) and transitioned with logged `version_transition` marker to `04ed0660e7866b8cce331eb127eb5a227a8b1907` (`352beccd9f1eed5e65e0ca354fa020774e899fbf`, `Issue #240`), persisted in `~/.cashclaw/live-reconciler-state.json` and `~/.cashclaw/g2-poly-shadow-telemetry.jsonl` |

### 2.2. Start Time (`T0`) & 30-Day Window Rules
- **`T0` for `G1-Soak` (`T0_G1`):** `1793536843401` epoch ms = **`2026-11-01T12:40:43.401Z`** (`2026-11-01T19:40:43.401+07:00` `Asia/Saigon`), persisted in KV `state.startedAt`. Target 30-day completion (`T0_G1 + 720h`): **`2026-12-01T12:40:43.401Z`**.
- **`T0` for `G2-Poly-Shadow` (`T0_G2`):** **`1794047000444` epoch ms = `2026-11-07T09:03:20.444Z`** (Day `1/30` active across `3` probe cycles / `6` fills), preserved via `allowCohortContinuation: true` in `~/.cashclaw/live-reconciler-state.json` (`startedAtMs`) and `~/.cashclaw/g2-poly-shadow-telemetry.jsonl` (`loopStartedAtMs`). Target 30-day completion (`T0_G2 + 720h`): **`2026-12-07T09:03:20.444Z`**.

### 2.3. Mandatory Telemetry Identity Envelope
Every telemetry snapshot recorded during the 30-day window must include:
1. `observedAtIso` (UTC ISO-8601) and `observedAtMs` (epoch ms).
2. `workerVersionId`: Active Cloudflare Worker Version ID (currently `1222ce87-907a-402d-87d6-10cb8172be4f`).
3. `sourceCommitSha` & `srcTreeHash`: Verified bundle commit (`2512e432` / `c842756f` on Edge; `04ed0660` on `G2-Poly-Shadow`) and `src/` git tree hash (`3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b` on Edge; `352beccd9f1eed5e65e0ca354fa020774e899fbf` on `G2-Poly-Shadow`), alongside `reportedStaticSecretSha` (`1fa01ca4b89eea4b88e335cdbf0e928da65c1142` until the next authorized secret sync) and `provenanceSource` (`env_secret | build_embedded | unknown`).
4. `loopStartedAtMs`: `state.startedAt` (`1793536843401` on `G1-Soak`; `1794047000444` on `G2-Poly-Shadow`) proving uninterrupted cohort continuity.

### 2.4. Missing-Data & Restart Rules
1. **Stateless Isolate Cold Start / Warm Restart (`< 15 min` gap, intact KV/D1 state) & Periodic `G2-Poly-Shadow` Cohort Continuation (`allowCohortContinuation: true`):**
   - If `state.startedAt` (`1793536843401`) or `T0_G2` (`1794047000444`) is unchanged, `unexplainedDriftUsdc === 0 && unknownOrderCount === 0` (fail-closed rollback if violated), and KV/D1 reconciliation drift is `0`, the 30-day clock continues without reset.
2. **Moderate External Outage (`15 min` to `< 4 hours` gap on continuous `G1-Soak`, intact KV/D1 state):**
   - If KV `startedAt` and D1 `paper_trades_v3` remain 100% reconciled (`drift = 0`), the run remains valid but the outage duration (minimum `+24h` penalty extension) is appended to the 30-day completion deadline.
3. **State Reset, Counter Rollback, or Extended Outage (`>= 4 hours` on `G1-Soak` or KV/reconciler state corruption):**
   - If KV `paper-trading-loop-state` is lost (`startedAt` resets), `tradeCounter` regresses (`tradeCounter_t < tradeCounter_{t-1}`), or `unexplainedDriftUsdc !== 0 || unknownOrderCount > 0`, the active cohort is **INVALIDATED** and the 30-day clock resets to **Day `0/30`** after root-cause remediation.

### 2.5. Version-Change Rules
1. **Documentation / Audit-Only Commits (`plans/**`, `docs/**`, `*.md`):**
   - When `git rev-parse HEAD:src` (`3dfd5f6ee55a653402ebb5f77aedb8e9c1b6d67b`) and `wrangler.toml` blob hash (`2fae4b79a10938c18f53af97e2d456694b79c44b`) are unchanged (e.g., `2512e432` -> `c842756f`), no Worker redeploy is performed and the 30-day clock continues uninterrupted.
2. **Observability-Only Patch (Adding Read-Only Telemetry Fields / Syncing `COMMIT_SHA` / Cohort Continuation):**
   - Allowed without resetting the 30-day clock **only if** execution/pricing/fee/reconciler logic is untouched, pre-deploy and post-deploy snapshots both verify `drift = 0`, `startedAt` (`T0_G1` / `T0_G2`) is preserved, and a `Version Transition Marker` (`event: "version_transition"`, `previousCommitSha -> currentCommitSha`, `previousSrcTreeHash -> currentSrcTreeHash`, timestamp) is logged (verified in `~/.cashclaw/g2-poly-shadow-telemetry.jsonl` at `2026-11-07T18:37:06.742Z` for `0996c20c -> 04ed0660`).
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
   *(Verified live at Day 1 `2026-11-02T02:45:00.823Z` across 63 trades with `SUM(pnl) = -5.193679`, and again at Day 6 `2026-11-07` across 663 closed trades with `KV totalPnlUsd = -62.257087824102896` vs `D1 SUM(pnl) = -62.25708782410294`, $\Delta \approx 4.26 \times 10^{-14}\text{ USD} \le 10^{-6}\text{ USD}$).*

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

### 2.8. CLOB V2 Core Primitives (Verified in Code, Not Yet in the Live Order Path)

The `POLY-ALPHA-HUNTER-V4` primitives landed on `feat/poly-v4-clob-v2-core-port` (`Issue #242`) are verified by unit tests but are **not** yet wired into the live order path. Until they are, the `G2-Poly-Shadow` reconciler must keep reporting against the existing fee and risk model:

- **Fee model:** `polymarket-fee-calculator.ts` now carries the quadratic V2 curve (`calcQuadraticTakerFeeRateV2`, `calcQuadraticTakerFeeV2`, `calcMakerRebateV2`, `calcLiquidityRewardScoreV2`) alongside the legacy flat `calcTakerFee` / `calcMakerRebate`, which `G2-Poly-Shadow` still calls. Switching the shadow runtime to the quadratic curve requires a new cohort (`version_transition` marker) so Day-1..N fee history is not silently re-priced under a different model.
- **Accounting:** `integer-micro-unit-fifo-ledger.ts` (`IntegerMicroUnitFifoLedger`, `MICRO_PER_PUSD = 1_000_000`) supersedes the float ledger math for new positions only. Existing `~/.cashclaw/live-reconciler-state.json` balances remain authoritative for the current cohort; migration requires a reconciliation cut-over with `unexplainedDriftUsdc === 0` on both sides before the ledger is swapped.
- **Pre-trade risk:** `polymarket-v2-pretrade-risk-gate.ts` (`PolymarketV2PreTradeRiskGate`, `floorMarketBuyNotionalMicro`, `computeEffectiveRewardDepthMicro`) is available but unenforced on `OrderDispatcher` / `SynchronizedRiskGate`, so `G2-Poly-Shadow` order admission still uses the prior checks.
- **Microstructure & market making:** `onchain-ofi-vpin-estimator.ts` (aggressor decode, 5-level OFI, VPIN, 4-state regime) and `log-odds-avellaneda-stoikov-mm.ts` (reservation price, half-spread, conservative queue simulator) are research/evaluation seams. No maker quoting is live, so they cannot affect the shadow cohort.

Wire and verify these in `PAPER` mode before any Gate `G3` discussion; Gate `G3` remains **BLOCKED** (PR pending).
