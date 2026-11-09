---
title: "POLY-ALPHA-HUNTER-V4 Stage S9: Runtime Orchestrator Settlement, VWAP MTM & Dynamic OFI/VPIN/Book-Error Risk Gate Wiring"
status: completed
issue: 260
branch: feat/poly-v4-s9-runtime-settlement-and-microstructure-wiring
created: 2026-11-09
---

# Plan: Stage S9 — Runtime Settlement, VWAP MTM & Dynamic OFI/VPIN Risk Gate Wiring

## 1. Objective & Scope
Close the remaining `POLY-ALPHA-HUNTER-V4` runtime seams:
1. **Orchestrator Binary Redemption (`settleMarketRedemption`) & VWAP Bid MTM (`computeUnrealizedMtm`) + `PolymarketSettlementListener` Sync:**
   - Expose `settleMarketRedemption` and `computeUnrealizedMtm` on `LiveTradingOrchestrator` (via `polymarket-microstructure-tracker.ts` helper functions so `live-trading-orchestrator.ts` stays `<= 195` LOC), updating `PolymarketOrderReconciler`, `LivePositionTracker`, `LiveTradingJournal` (`'market_redemption'`), and persisting `PAPER` state with `unexplainedDriftUsdc === 0`.
   - Extend `SettlementListenerConfig` with optional `reconciler?: PolymarketOrderReconciler` so `PolymarketSettlementListener` automatically settles open reconciler shares upon `handleMarketResolved` or `handleCtfPayout`.
2. **Dynamic Per-Token Microstructure (`OFI^(5)_t`, `VolumeSynchronizedVpinEstimator`, 4-State `RegimeEstimate`) & `consecutiveBookErrors` Tracker:**
   - Create `src/desk/polymarket/polymarket-microstructure-tracker.ts` (`<= 200` LOC) tracking per-token 5-level orderbook snapshots (`computeFiveLevelOfiMicro`), on-chain trade prints (`VolumeSynchronizedVpinEstimator`), 4-state `RegimeEstimate` (`estimateRegimeFromOfiVpin`), and `consecutiveBookErrors`.
   - Auto-update `recordOrderBookSnapshot` (resets `consecutiveBookErrors` to 0) or `recordBookError` (increments `consecutiveBookErrors`) inside `executePaperOrderPlacement` when calling `paperOrderBookProvider(tokenId)`.
   - Wire `getRiskContext: (tokenId) => ({ currentVpin, consecutiveBookErrors })` into `validateOrchestratorOrderV2`, `LiveOrderManager`, `live-order-risk-gates.ts`, and `live-order-submission.ts` so `PolymarketV2PreTradeRiskGate` rejects toxic orders (`VPIN_TOXICITY_EXCEEDED` when `currentVpin > 0.70`) and broken feeds (`CONSECUTIVE_BOOK_ERRORS_EXCEEDED` when `consecutiveBookErrors >= 3`).
3. **Verification & Shadow Telemetry:**
   - Add `src/desk/__tests__/poly-v4-runtime-settlement-and-microstructure.test.ts` (`<= 200` LOC).
   - Verify `npx tsc --noEmit`, `npm run check:leaderboard`, and `node scripts/check-quality-baseline.mjs --all` (`12/12` PASS).
   - Run `npx tsx scripts/run-g2-poly-shadow-probe.ts --allow-continuation`, sample read-only `G1-Soak` status, and synchronize `plans/reports/audit-261101-golive-poly/{00..11}*.md`.

## 2. File Ownership & LOC Budget (`<= 200` LOC)
| File | Action | Target LOC |
|---|---|---|
| `src/desk/polymarket/polymarket-microstructure-tracker.ts` | Create | `<= 190` |
| `src/desk/polymarket/live-trading-orchestrator.ts` | Modify | `<= 195` |
| `src/desk/polymarket/live-trading-adapter-setup.ts` | Modify | `<= 195` |
| `src/desk/polymarket/polymarket-settlement-helpers.ts` | Modify | `<= 110` |
| `src/desk/polymarket/polymarket-settlement-listener.ts` | Modify | `<= 145` |
| `src/desk/execution/live-trading-journal.ts` | Modify | `<= 160` |
| `src/desk/execution/polymarket-v2-pretrade-bridge.ts` | Modify | `<= 195` |
| `src/desk/execution/live-order-manager-types.ts` | Modify | `<= 135` |
| `src/desk/execution/live-order-manager.ts` | Modify | `<= 165` |
| `src/desk/execution/live-order-risk-gates.ts` | Modify | `<= 155` |
| `src/desk/execution/live-order-submission.ts` | Modify | `<= 140` |
| `src/desk/__tests__/poly-v4-runtime-settlement-and-microstructure.test.ts` | Create | `<= 190` |
