---
title: "Wire G2-Poly-Shadow Paper Runtime (PolymarketOrderReconciler, LiveOrderManagerProxy, StrategyRunner Deps) & Synchronize Audit Deliverables"
description: "Wire PolymarketOrderReconciler into LiveTradingOrchestrator, propagate PAPER fill/fee confirmation in LiveOrderManagerProxy, wire read-only clobClient + GammaClientImpl in createRunnerStrategyDeps, and synchronize audit deliverables 00, 02, 04, 05, 08, 10, and 11."
status: completed
priority: P1
effort: 30m
branch: feat/g2-poly-shadow-reconciler-wiring
tags: [polymarket, reconciler, shadow-protocol, paper-trading, strategy-runner, audit, g2]
created: 2026-11-02
---

# Plan: Wire G2-Poly-Shadow Paper Runtime & Synchronize Audit Deliverables

## Context & Problem Statement

1. **Orphaned `PolymarketOrderReconciler` (`src/desk/execution/polymarket-order-reconciler.ts`):**
   - `PolymarketOrderReconciler` was introduced in Stage S4 (`PR #218`) to enforce deterministic order lifecycle transitions, `UNKNOWN` market lock, and zero accounting drift (`unexplainedDriftUsdc === 0`), but it has zero production callers in `src/` (only imported in `tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts`).
2. **Broken `StrategyRunner` Dependencies (`src/desk/polymarket/strategy-runner-executor.ts:34-41`):**
   - `createRunnerStrategyDeps` sets `clob: null` and `gamma: null`, causing any `BasePolymarketStrategy` / `PolymarketArbStrategy` launched via `StrategyRunner` (`cashclaw trade run --strategy=polymarket-arb`) to crash when calling `this.deps.gamma.getTrending(15)` or `this.deps.clob.getOrderBook(...)`.
3. **Missing Fill & Fee Metadata in `LiveOrderManagerProxy` (`src/desk/polymarket/live-order-manager-proxy.ts`):**
   - `LiveOrderManagerProxy.placeOrder` returns `{ id: orderId }` without `filled`, `filledSize`, `fillPrice`, or `fees` when `response.status === 'matched'`, preventing `BasePolymarketStrategy` (`performEntry` / `performExit`) from recording venue-confirmed paper fees and fill notionals during `G2-Poly-Shadow`.
4. **Audit Deliverables Lag (`00`, `02`, `04`, `05`, `08`, `10`, `11`):**
   - `00-scope-and-inventory.md`, `02-verification-matrix.md`, `05-change-log.md`, and `10-executive-summary.md` still list `2512e432` (`PR #224`) as the base commit and omit `PR #226` (`c842756f`), `PR #228` (`175bb045`, `Issue #227`), and the new `G2-Poly-Shadow` runtime wiring.

## Scope Boundary & Non-Goals

- **In Scope:**
  - `src/desk/polymarket/live-trading-adapter-setup.ts` & `src/desk/polymarket/live-trading-orchestrator.ts`: Instantiate `PolymarketOrderReconciler(config.capitalUsdc)`, record `PAPER` order lifecycle + taker fees on `placeOrder` and `CANCELLED` on `cancelOrder`, and expose `getReconciler()` and `getReconciliationSummary()`.
  - `src/desk/polymarket/live-order-manager-proxy.ts`: Populate `filled: true`, `filledSize`, `fillPrice`, and dynamic taker `fees` (via `calcTakerFee`) when `result.response?.status === 'matched'`, while preserving `{ id: orderId }` when `status` is not `'matched'`.
  - `src/desk/polymarket/strategy-runner-types.ts`, `src/desk/polymarket/strategy-runner-executor.ts`, & `src/desk/polymarket/strategy-runner.ts`: Wire read-only `clobClient` and `new GammaClientImpl()` defaults in `createRunnerStrategyDeps` with optional `deps?: Partial<StrategyDeps>` overrides on `StrategyRunnerConfig`.
  - Unit & integration tests in `tests/unit/desk/polymarket/g2-poly-shadow-runtime-wiring.test.ts`, `tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts`, `tests/unit/desk/polymarket/live-order-manager-proxy.test.ts`, and `tests/unit/desk/polymarket/live-trading-orchestrator.test.ts`.
  - Synchronize `plans/reports/audit-261101-golive-poly/{00,02,04,05,08,10,11}*.md`.
- **Out of Scope / Non-Goals:**
  - Do not touch remote Cloudflare staging (`algo-trader-staging`) or production (`algo-trader`, `m1pro-home`).
  - Do not enable `LIVE_TRADING_ENABLED` or claim 30-day `G2` completion (`0/30` days elapsed).
  - Keep `#5, #9-PG` (PostgreSQL Host Staging) and Gates `G2`/`G3` strictly `BLOCKED`.

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | Wire `PolymarketOrderReconciler`, `LiveOrderManagerProxy` Fill/Fee Metadata & `StrategyRunner` Deps with TDD & Audit Sync | completed | `src/desk/polymarket/live-trading-adapter-setup.ts`, `src/desk/polymarket/live-trading-orchestrator.ts`, `src/desk/polymarket/live-order-manager-proxy.ts`, `src/desk/polymarket/strategy-runner-types.ts`, `src/desk/polymarket/strategy-runner-executor.ts`, `src/desk/polymarket/strategy-runner.ts`, `tests/unit/desk/polymarket/g2-poly-shadow-runtime-wiring.test.ts`, `plans/reports/audit-261101-golive-poly/*.md` |

## Acceptance Criteria

1. `LiveTradingOrchestrator` initializes `PolymarketOrderReconciler(config.capitalUsdc)`, records `CREATED -> SUBMITTED -> ACKNOWLEDGED -> FILLED` (with taker fee) on `placeOrder` in `PAPER` mode and `CANCELLED` on `cancelOrder`, and exposes `getReconciler()` and `getReconciliationSummary()` with `unexplainedDriftUsdc === 0`.
2. `LiveOrderManagerProxy.placeOrder` returns `{ id, filled: true, filledSize, fillPrice, fees }` when `result.response?.status === 'matched'`, and `{ id }` otherwise.
3. `createRunnerStrategyDeps` provides `clobClient` and `new GammaClientImpl()` by default and merges optional `deps?: Partial<StrategyDeps>` from `StrategyRunnerConfig`, allowing `StrategyRunner` to run `PolymarketArbStrategy` in `PAPER` mode end-to-end with zero reconciler drift.
4. All unit tests pass (`0` failures), `npx tsc --noEmit` exits `0`, and all touched `.ts` files stay strictly `<= 200` LOC.
5. Audit deliverables `00`, `02`, `04`, `05`, `08`, `10`, and `11` are synchronized with `PR #226` (`c842756f`), `PR #228` (`175bb045`), and the new `G2-Poly-Shadow` runtime wiring.
