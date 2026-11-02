---
title: "Harden G2-Poly-Shadow Paper Runtime (Live Getters, Orderbook-Backed Paper Sweep, Dual-Ledger Sync, Atomic Persistence & CLI Telemetry)"
description: "Fix StrategyRunner closure staleness & RiskGate routing, add orderbook-backed PAPER fill simulation + Leg-2 decay tracking, synchronize LivePositionTracker + PolymarketOrderReconciler + LiveTradingJournal, persist reconciler + T0_G2 + telemetry JSONL envelope atomically in ~/.cashclaw/, and expose getPositionSummary/getReconciliationSummary on StrategyRunner."
status: completed
priority: P1
effort: 45m
branch: feat/g2-poly-shadow-paper-hardening
tags: [polymarket, g2-poly-shadow, paper-trading, reconciler, orderbook-sweep, persistence, strategy-runner, audit]
created: 2026-11-02
---

# Plan: Harden G2-Poly-Shadow Paper Runtime (`R1`–`R5`, `D1`–`D6`)

## Context & Problem Statement

At commit `9c7b871950ccb32c1dd22bbac3abb7e76c5a5891` (`PR #230`, `Issue #229`), `PolymarketOrderReconciler`, `LiveOrderManagerProxy`, and `StrategyRunner` dependencies were wired, but four concrete runtime defects prevent a truthful 30-day `G2-Poly-Shadow` paper cohort:

1. **Frozen Closure Primitives & RiskGate Bypass in `StrategyRunner` (`R1`):**
   - `StrategyRunner.buildExecutionBase()` (`src/desk/polymarket/strategy-runner.ts:97-133`) copies `this.status`, `this.executionCount`, and `this.lastExecutionTime` by value. Because `setupEventBus()` constructs `ctx` once at `start()`, `ctx.executionCount` and `ctx.lastExecutionTime` never update on reactive `PRICE_UPDATE` events (breaking `minExecutionIntervalMs` debounce and `maxTicks` auto-stop), and neither reactive nor polling ticks route through `this.orchestrator.executeStrategyTick(this.strategyName, ...)` (`RiskGateManager.check`).
2. **Unconditional 100% Paper Fill & Desynchronized `LivePositionTracker` / `LiveTradingJournal` (`R2`, `R3`):**
   - In `PAPER` mode (`paperTrading: true`), `LiveTradingOrchestrator.placeOrder` returns `{ orderID, status: 'matched' }` at 100% requested size without sweeping CLOB orderbook depth (`bids`/`asks` when a `paperOrderBookProvider` is configured), without calling `this.positionTracker.recordFill(...)`, and without calling `this.journal.recordFill(...)`. Consequently, `getPositionSummary()` stays at `0` positions / `$0.00` exposure / `$0.00` PnL and Leg-2 fill decay is `0%` by construction.
3. **In-Memory-Only `PolymarketOrderReconciler` & Missing `T0_G2` / Telemetry Identity Persistence (`R4`):**
   - `PolymarketOrderReconciler` is recreated from scratch on every `start()` with no `serialize()`/`hydrate()` in `~/.cashclaw/`, and no persisted `startedAtMs` (`T0_G2`) or mandatory telemetry identity envelope (`observedAtIso`, `observedAtMs`, `sourceCommitSha`, `srcTreeHash`, `loopStartedAtMs`).
4. **Broken CLI Position Summary Cast (`R5`):**
   - `runSingleStrategy` (`src/desk/cli/cashclaw-trade-runner-subroutines.ts:49-66`) casts `(runner as unknown as SummaryGetter).getPositionSummary?.()`, which does not exist on `StrategyRunner`, so CLI status logs always print `Positions: 0 | Exposure: $0.00 | PnL: $0.00`.

## Scope Boundary & Non-Goals

- **In Scope (`R1`–`R5`):**
  - **R1:** Live state getters (`getStatus()`, `getExecutionCount()`, `getLastExecutionTime()`, `getStrategy()`) in `StrategyRunner`, `strategy-runner-event-handlers.ts`, `strategy-runner-executor.ts`, and `strategy-runner-tick-timer.ts`, plus routing every strategy tick through `orchestrator.executeStrategyTick(strategyName, ...)`.
  - **R2:** `src/desk/polymarket/paper-orderbook-simulator.ts` (`<= 200` LOC) implementing deterministic level-by-level CLOB orderbook sweep (`FILLED`, `PARTIALLY_FILLED`, `REJECTED`/`unmatched`), VWAP fill price, dynamic taker fees, and Leg-1 -> Leg-2 fill decay tracking (`leg2FillDecayRatio`, compensatory unwind). Preserves 100% backward compatibility when `paperOrderBookProvider` is not configured in legacy unit tests.
  - **R3:** Tri-state atomic synchronization (`PolymarketOrderReconciler` + `LivePositionTracker.recordFill` + `LiveTradingJournal.recordFill`) on every `PAPER` fill, plus `filledSize`, `fillPrice`, and `feeUsdc` propagation in `PolymarketOrderResponse` and `LiveOrderManagerProxy.placeOrder` (including `filled: false` when `status === 'unmatched'`).
  - **R4:** `serialize()` / `hydrate()` on `PolymarketOrderReconciler` (`src/desk/execution/polymarket-order-reconciler.ts`), atomic persistence of reconciler state and `startedAtMs` (`T0_G2`) across `< 15m` restarts in `~/.cashclaw/` (`src/desk/polymarket/g2-shadow-telemetry.ts`, `src/desk/execution/live-trading-journal.ts`, `src/desk/polymarket/live-trading-state-persistence.ts`), and JSONL telemetry identity envelope in `~/.cashclaw/g2-poly-shadow-telemetry.jsonl`.
  - **R5:** `getPositionSummary()` and `getReconciliationSummary()` on `StrategyRunner` (`src/desk/polymarket/strategy-runner.ts`), `ordersPlaced` fix in `strategy-runner-status-builder.ts`, and truthful CLI status logging in `src/desk/cli/cashclaw-trade-runner-subroutines.ts`.
  - Synchronize `plans/reports/audit-261101-golive-poly/{00,02,04,05,08,10,11}*.md` with the new hardening evidence.
- **Out of Scope / Non-Goals:**
  - Do NOT touch remote Cloudflare staging (`algo-trader-staging` / `G1-Soak`) or production (`algo-trader`, `api.cashclaw.cc`, `m1pro-home`).
  - Do NOT enable `LIVE_TRADING_ENABLED` or claim `30/30` G2 completion (`0/30` days elapsed).
  - Keep `#5, #9-PG` (PostgreSQL Host Staging) and Gates `G2`/`G3` strictly `BLOCKED`.

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | Harden `StrategyRunner` Live Getters, Orderbook-Backed Paper Simulator, Dual-Ledger Sync, Atomic Persistence & CLI Telemetry with TDD & Audit Sync | completed | `src/desk/polymarket/paper-orderbook-simulator.ts`, `src/desk/polymarket/g2-shadow-telemetry.ts`, `src/desk/execution/polymarket-order-reconciler.ts`, `src/desk/execution/polymarket-adapter-types.ts`, `src/desk/execution/live-trading-journal.ts`, `src/desk/polymarket/live-trading-state-persistence.ts`, `src/desk/polymarket/live-trading-adapter-setup.ts`, `src/desk/polymarket/live-trading-orchestrator.ts`, `src/desk/polymarket/live-order-manager-proxy.ts`, `src/desk/polymarket/strategy-runner.ts`, `src/desk/polymarket/strategy-runner-event-handlers.ts`, `src/desk/polymarket/strategy-runner-executor.ts`, `src/desk/polymarket/strategy-runner-tick-timer.ts`, `src/desk/polymarket/strategy-runner-status-builder.ts`, `src/desk/cli/cashclaw-trade-runner-subroutines.ts`, `src/desk/polymarket/__tests__/strategy-runner-fixtures.ts`, `tests/unit/desk/polymarket/g2-poly-shadow-runtime-wiring.test.ts`, `tests/unit/desk/polymarket/g2-poly-shadow-paper-hardening.test.ts`, `plans/reports/audit-261101-golive-poly/*.md` |

## Acceptance Criteria (`D1`–`D6`)

1. **D1:** Both reactive `PRICE_UPDATE` events and polling timer ticks enforce `minExecutionIntervalMs` debounce, auto-stop at `maxTicks`, and route through `orchestrator.executeStrategyTick(strategyName, ...)` (`RiskGateManager.check`).
2. **D2:** `PAPER` orders with an active `paperOrderBookProvider` sweep CLOB orderbook depth (`FILLED`, `PARTIALLY_FILLED` with VWAP fill price, and `REJECTED`/`unmatched` returning `filled: false`), track `leg2FillDecayRatio`, and trigger Leg-1 compensatory unwind in `PolymarketArbStrategy` when Leg-2 fails.
3. **D3:** `runner.getPositionSummary()` and `runner.getReconciliationSummary()` stay synchronized across fills with `unexplainedDriftUsdc === 0`.
4. **D4:** Restarting `LiveTradingOrchestrator` within `< 15m` (`stop()` -> `new LiveTradingOrchestrator()` -> `start()`) restores `startedAtMs` (`T0_G2`), `cashUsdc`, `totalFeesUsdc`, and `positionsByToken` atomically from `~/.cashclaw/`.
5. **D5:** `~/.cashclaw/g2-poly-shadow-telemetry.jsonl` records valid JSONL entries containing `observedAtIso`, `observedAtMs`, `sourceCommitSha`, `srcTreeHash`, and `loopStartedAtMs`.
6. **D6:** `npx tsc --noEmit` exits `0`, all unit and integration tests pass (`0` failures), and every touched `.ts` file is strictly `<= 200` LOC with zero `:any` types.
