---
title: "Wire POLY-ALPHA-HUNTER-V4 Core Primitives into Pre-Trade Risk, Reconciler Ledger & Market Maker"
status: completed
issue: 252
branch: feat/poly-v4-core-primitives-wiring
created_at: 2026-11-09
---

# Plan: Wire POLY-ALPHA-HUNTER-V4 Core Primitives (#252)

## 1. Objective
Connect the 4 core `POLY-ALPHA-HUNTER-V4` primitives (`PolymarketV2PreTradeRiskGate`, `IntegerMicroUnitFifoLedger`, `OnchainOfiVpinEstimator`, `LogOddsAvellanedaStoikovMarketMaker`) into the production Polymarket pre-trade risk gates, order reconciler accounting ledger, and market-maker quoting strategy while keeping every file in `src/` strictly `<= 200 LOC`.

## 2. Done Means (Observable Verification)
1. **Seam 1 (Pre-Trade Risk Gate):** `PolymarketV2PreTradeRiskGate` is wired into `SynchronizedRiskGate`, `TriModeDispatcher` / `OrderDispatcher`, and `LiveOrderManager` (`runRiskGates`) via `src/desk/execution/polymarket-v2-pretrade-bridge.ts`, rejecting violations (`VPIN > 0.70`, `CVaR > 3.5%`, invalid tick grid/alignment, price outside `[$0.02, $0.98]`, `< 5` limit shares, insufficient 20% reserved balance) in unit & integration tests.
2. **Seam 2 (Micro-Unit FIFO Ledger in Reconciler):** `PolymarketOrderReconciler` updates `IntegerMicroUnitFifoLedger` on `PARTIALLY_FILLED` and `FILLED` events via `src/desk/execution/polymarket-order-reconciler-ledger.ts`, exposes micro-unit FIFO metrics in `ReconciliationSummary`, supports backward-compatible `serialize()` / `hydrate()` with `g2-shadow-telemetry.ts`, and maintains `unexplainedDriftUsdc === 0`.
3. **Seam 3 (OFI/VPIN + Log-Odds A-S in Market Maker):** `MarketMakerStrategy` integrates `OnchainOfiVpinEstimator` and `LogOddsAvellanedaStoikovMarketMaker` via `src/desk/strategies/polymarket/market-maker-v2-quoting.ts`, halting quotes when `VPIN > 0.70` (`state === 3`, `isToxicKillSwitchTriggered === true`) and supporting log-odds A-S quote generation.
4. **Quality & Delivery:** Every modified/created file in `src/` is `<= 200 LOC`, `npx tsc --noEmit` passes with `0` errors, all unit/integration tests pass, isolated `code-reviewer` review is clean, PR is opened, passes CI, and merges into `main`.

## 3. Out of Scope & Constraints
- Do not enable `LIVE_TRADING_ENABLED=true` (Gate `G3` remains `BLOCKED`).
- Do not redeploy Cloudflare Worker `algo-trader` (`G1-Soak` remains untouched).
- Do not touch `m1pro-home`.
- Preserve `G2-Poly-Shadow` telemetry backward compatibility.
- Zero `:any` types, zero `console.log` in production `src/`.

## 4. Implementation Phases

### Phase 1: Seam 1 — Pre-Trade Risk Gate Wiring
- Create `src/desk/execution/polymarket-v2-pretrade-bridge.ts` (`<= 120 LOC`) to map `UnifiedTradeIntent` and `TradeSignal` into `PreTradeOrderCandidateV2` and run `PolymarketV2PreTradeRiskGate`.
- Wire optional `polymarketV2Gate?: PolymarketV2PreTradeRiskGate` into:
  - `src/desk/orchestrator/risk-gate-types.ts` & `src/desk/orchestrator/synchronized-risk-gate.ts`
  - `src/desk/execution/tri-mode-dispatcher.ts` & `src/desk/execution/order-dispatcher.ts`
  - `src/desk/execution/live-order-manager-types.ts`, `src/desk/execution/live-order-manager.ts`, & `src/desk/execution/live-order-risk-gates.ts`

### Phase 2: Seam 2 — Reconciler Micro-Unit FIFO Ledger Wiring
- Create `src/desk/execution/polymarket-order-reconciler-ledger.ts` (`<= 140 LOC`) encapsulating `IntegerMicroUnitFifoLedger` fill/settlement recording, snapshot serialization/hydration, and micro-unit summary fields.
- Update `src/desk/execution/polymarket-order-reconciler.ts` (`<= 185 LOC`) to delegate fill ledger updates, expose `getFifoLedger()`, include micro-unit metrics in `ReconciliationSummary`, and support backward-compatible `serialize()` / `hydrate()`.

### Phase 3: Seam 3 — Market Maker V2 OFI/VPIN & Log-Odds A-S Quoting
- Create `src/desk/strategies/polymarket/market-maker-v2-quoting.ts` (`<= 160 LOC`) integrating `computeFiveLevelOfiMicro`, `VolumeSynchronizedVpinEstimator`, `estimateRegimeFromOfiVpin`, and `LogOddsAvellanedaStoikovMarketMaker`.
- Update `src/desk/strategies/polymarket/market-maker-math.ts` (`<= 175 LOC`) and `src/desk/strategies/polymarket/market-maker.ts` (`<= 185 LOC`) to record on-chain trades, compute OFI/VPIN regime on each tick, halt quoting when `isToxicKillSwitchTriggered` (`state === 3`), and compute quotes via `LogOddsAvellanedaStoikovMarketMaker` when `useLogOddsAsQuoting` is enabled.

### Phase 4: Verification, Review & Ship
- Add comprehensive test suite `src/desk/__tests__/poly-v4-core-primitives-wiring.test.ts` covering all 3 seams and regression-test existing suites.
- Run `npx tsc --noEmit` and line-count check across all touched `src/` files (`<= 200 LOC`).
- Run isolated `code-reviewer` subagent review, push branch, open PR, verify CI green, and merge into `main`.
