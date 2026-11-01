---
title: "Stage S4 & S5 — Polymarket Execution & Accounting Hardening + Research Protocol & Audit Deliverables"
description: "Unify LIVE_TRADING_ENABLED execution mode gates across all Polymarket live entrypoints, enforce fee/partial-fill/cash accounting and multi-leg arb depth + leg-2 unwind safety, add deterministic order-lifecycle replay & OOS walk-forward evaluation, and deliver the 12 Go-Live & Polymarket audit artifacts."
status: completed
priority: P1
effort: 6h
branch: feat/s4-s5-polymarket-execution-and-research
tags: [polymarket, execution, accounting, arbitrage, research, audit, s4, s5]
created: 2026-11-01
---

# Plan: Stage S4 & S5 — Polymarket Execution Contract, Accounting, Deterministic Replay & Research Deliverables

## Context & Problem Statement

Following the completion and merge of `S0–S2` (`PR #214`) and `S3/G1` Cloudflare Edge Staging & SaaS/Paper Hardening (`Issue #215` / `PR #216`, merged at `8927dbc6`), the remaining engineering and research stages in `plans/reports/advise-261030-golive-poly-master-plan.md` are **Stage S4 (Polymarket Execution Contract & Accounting)** and **Stage S5 (Polymarket Research Protocol & 12 Audit Deliverables)**.

Code inspection identified four concrete S4 execution/accounting gaps and the S5 research/deliverable requirements:
1. **Execution Mode Gate Bypass (`submitOnlyOrder` & `buildPolymarketAdapter`):**
   - `src/desk/execution/live-order-submission.ts` (`submitOnlyOrder`) submits orders directly via `host.adapter.placeOrder(order)` without checking `host.stopped` or `requireLiveEnabled('LiveOrderManager.submitOnly')`.
   - `src/desk/execution/polymarket-execution-adapter.ts` (`buildPolymarketAdapter`) instantiates a live `PolymarketSigner` and `PolymarketAdapter` when `config.paperTrading === false` or `POLYMARKET_TRADING_MODE=live` even when `LIVE_TRADING_ENABLED !== 'true'` (`!isLiveEnabled()`).
2. **Fee & Partial-Fill Accounting in Strategy Trade Lifecycle:**
   - `PlaceOrderResult` (`src/desk/polymarket/order-manager.ts`), `OpenPosition` (`src/desk/strategies/polymarket/base-polymarket-strategy-types.ts`), `performEntry` / `performExit` (`src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts`), and `computeExitPnl` (`src/desk/strategies/polymarket/base-polymarket-strategy-exits.ts`) hardcode `fees: '0'`, ignore venue-confirmed partial fill sizing on `sizeUsdc`, and omit entry/exit fees from realized PnL.
3. **Multi-Leg Arbitrage Executable Depth & Leg-2 Failure Unwind (`PolymarketArbStrategy`):**
   - `src/desk/strategies/polymarket-arb-strategy.ts` checks best ask price (`yesBA.ask + noBA.ask < maxCombinedPrice`) but does not verify that top-of-book ask depth covers the required token quantity (`legSize / askPrice`), nor does it deduct estimated taker fees from the net spread.
   - If Leg 1 (`YES`) fills and Leg 2 (`NO`) fails or is rejected, Leg 1 remains silently open as an unhedged directional position with no compensatory unwind (`exitPosition`) or unhedged-exposure cooldown/halt.
4. **Order State Machine, Idempotency & Deterministic Replay / OOS Evaluation (S4 & S5):**
   - Need a deterministic Polymarket execution & accounting ledger/reconciler (`src/desk/execution/polymarket-order-reconciler.ts`) that models the full order state machine (`CREATED`, `SUBMITTED`, `ACKNOWLEDGED`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`, `REJECTED`, `UNKNOWN`), deduplicates out-of-order/duplicate fill events, blocks new order intents on a market with `UNKNOWN` state, and reconciles `cash + positions + fees` with zero unexplained drift.
   - Need a deterministic Out-of-Sample (OOS) / Walk-Forward & stress-test evaluation harness (`src/desk/polymarket/polymarket-oos-evaluator.ts`) comparing Polymarket strategy candidates against baseline (`no-trade`, `naive midpoint`, `executable ask + fee + leg-risk`) across normal and stressed regimes, plus the 12 structured audit reports (`00` through `11`) in `plans/reports/audit-261101-golive-poly/`.

## Scope Boundary & Non-Goals

- **In Scope:**
  - Phase 1 (S4 Gate & Accounting): `live-order-submission.ts`, `polymarket-execution-adapter.ts`, `order-manager.ts`, `base-polymarket-strategy-types.ts`, `base-polymarket-strategy-exits.ts`, `base-polymarket-strategy-trades.ts`.
  - Phase 2 (S4 Multi-Leg Arb & Order Reconciler): `polymarket-arb-helpers.ts`, `polymarket-arb-strategy.ts`, `polymarket-order-reconciler.ts`.
  - Phase 3 (S5 OOS Walk-Forward Evaluator & 12 Audit Deliverables): `polymarket-oos-evaluator.ts`, unit/replay/OOS test suites, and `plans/reports/audit-261101-golive-poly/00..11`.
- **Out of Scope / Non-Negotiable Constraints:**
  - **NO Live Capital / G2 / G3:** `LIVE_TRADING_ENABLED` remains disabled in runtime/staging; no signing, allowance, transfer, or real CLOB order placement. Gates `G2` (Shadow/Canary) and `G3` (Live Capital) remain `BLOCKED`.
  - **NO Production Mutation:** Do not touch `m1pro-home` or production Cloudflare Worker (`algo-trader`).
  - **NO Secret Exposure:** Never print raw credentials, tokens, private keys, or secret values.
  - **File Size Limit:** Every created or modified TypeScript source file must remain `< 200` LOC.

## Phases

| Phase | Name | Status | File Ownership |
|---|---|---|---|
| 1 | S4 Execution Mode Gate & Fee/Partial-Fill Accounting | completed | `src/desk/execution/live-order-submission.ts`, `src/desk/execution/polymarket-execution-adapter.ts`, `src/desk/polymarket/order-manager.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-types.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-exits.ts`, `src/desk/strategies/polymarket/base-polymarket-strategy-trades.ts` |
| 2 | S4 Multi-Leg Arb Safety & Deterministic Order Reconciler | completed | `src/desk/strategies/polymarket-arb-helpers.ts`, `src/desk/strategies/polymarket-arb-strategy.ts`, `src/desk/execution/polymarket-order-reconciler.ts` |
| 3 | S5 Walk-Forward OOS Evaluator, Test Suites & 12 Audit Reports | completed | `src/desk/polymarket/polymarket-oos-evaluator.ts`, `tests/unit/desk/execution/s4-s5-polymarket-hardening.test.ts`, `plans/reports/audit-261101-golive-poly/*.md` |

## Acceptance Criteria

1. `submitOnlyOrder` checks `if (host.stopped)` and calls `requireLiveEnabled('LiveOrderManager.submitOnly')`.
2. `buildPolymarketAdapter` refuses to construct a live signer/adapter unless `isLiveEnabled()` is true (`LIVE_TRADING_ENABLED === 'true'`), falling back safely to paper stub with a warning when `isLiveEnabled()` is false.
3. `PlaceOrderResult` supports optional `fees?: string`; `OpenPosition` tracks `entryFeesUsdc?: number`; `performEntry` and `performExit` record actual fill notional (`tokenQuantity * fillPrice`) and propagate venue fees (`order.fees ?? '0'`); `computeExitPnl` subtracts entry and exit fees from realized PnL.
4. `PolymarketArbStrategy` verifies top-of-book ask size covers `legSize / askPrice` on both YES and NO books before entering, and if Leg 2 (`NO`) throws after Leg 1 (`YES`) filled, immediately attempts a compensatory `exitPosition` on Leg 1 and sets market cooldown/unhedged halt so Leg 1 is never silently abandoned.
5. `PolymarketOrderReconciler` deterministically processes `CREATED -> SUBMITTED -> ACKNOWLEDGED -> PARTIALLY_FILLED -> FILLED / CANCELLED / REJECTED / UNKNOWN`, deduplicates repeated event IDs, rejects new order intents on markets with an `UNKNOWN` order, and proves zero cash/fee/position drift across replay and fault injection.
6. `PolymarketOosEvaluator` runs deterministic walk-forward (in-sample vs out-of-sample) and stressed one-leg/slippage/fee evaluations against baseline (`no-trade`, `naive-mid`, `executable-ask-fee-aware`) and outputs reproducible metrics.
7. All 12 audit deliverables (`00-scope-and-inventory.md` through `11-handoff.md`) are generated in `plans/reports/audit-261101-golive-poly/` with exact evidence, and `bash scripts/quality-ratchet.sh` passes 8/8 checks with 0 `any` types and 0 files over max lines.
