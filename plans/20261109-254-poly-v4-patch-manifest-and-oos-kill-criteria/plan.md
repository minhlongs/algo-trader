# Plan: POLY-ALPHA-HUNTER-V4 Patch Manifest, OOS Maker Kill Criterion & Audit Sync

- **Issue:** `#254`
- **Branch:** `feat/poly-v4-patch-manifest-and-oos-kill-criteria`
- **Status:** `completed`
- **Date:** `2026-11-09`

## Objective
Complete the remaining `POLY-ALPHA-HUNTER-V4` deliverables across the Polymarket CLOB V2 WebSocket/HTTP2 transport layer (`PATCH-03`, `PATCH-05`, `PATCH-07`, `PATCH-08`, `PATCH-12`), the walk-forward OOS maker evaluator (`BT-TRAP-07` competitive dilution & §10.10 `1.5x` markout kill criterion), and the `audit-261101-golive-poly` readiness documentation + `G2-Poly-Shadow` telemetry probe.

## Phases
1. **Phase 01 — WebSocket & Transport Hardening (`PATCH-03`, `PATCH-05`, `PATCH-07`, `PATCH-08`, `PATCH-12`):**
   - `src/desk/polymarket/orderbook-stream-types.ts`
   - `src/desk/polymarket/orderbook-stream-parse.ts`
   - `src/desk/polymarket/orderbook-stream-ws.ts`
   - `src/desk/polymarket/orderbook-stream.ts`
   - `src/desk/execution/polymarket-adapter-transport.ts`
   - `src/desk/execution/live-order-submission.ts`
2. **Phase 02 — OOS Maker `BT-TRAP-07` Dilution & §10.10 Markout Kill Criterion:**
   - `src/desk/polymarket/polymarket-oos-maker-episode-simulator.ts`
   - `src/desk/polymarket/polymarket-oos-evaluator.ts`
3. **Phase 03 — Audit Documentation & `G2-Poly-Shadow` Probe Sync:**
   - `plans/reports/audit-261101-golive-poly/08-live-readiness-and-canary.md`
   - `plans/reports/audit-261101-golive-poly/10-executive-summary.md`
   - `plans/reports/audit-261101-golive-poly/11-handoff.md`
   - `tests/desk/polymarket-v4-patch-manifest-and-kill-criteria.test.ts`

## Acceptance Criteria
- Every touched file in `src/` is `<= 200` LOC with `0` `:any` types and `0` `console.log`.
- Unit and integration tests cover `PATCH-03`, `PATCH-05`, `PATCH-07`, `PATCH-08`, `PATCH-12`, `BT-TRAP-07`, and §10.10 Maker Markout Kill Criterion.
- `scripts/run-g2-poly-shadow-probe.ts` runs with `allowCohortContinuation: true` and `unexplainedDriftUsdc === 0`.
