# Wire `LiveExecutionGuard` into `TriModeDispatcher` and `SynchronizedRiskGate` + Reconcile Plan & Audit Handoff

Status: completed
Date: 2026-11-07
Branch: `fix/tri-mode-dispatcher-and-risk-gate-live-guard` (Issue #236)

## Objective

Enforce the configured `LiveExecutionGuard` pre-execution safety checks inside both `TriModeDispatcher` (`LIVE` mode) and `SynchronizedRiskGate` (`validateOrder`), and reconcile the completed status/provenance of PR #232, PR #233, and PR #235 in `plans/20261106-backtest-fee-honesty-and-live-fail-closed/plan.md` and `plans/reports/audit-261101-golive-poly/11-handoff.md`.

## Evidence (verified before planning)

1. `src/desk/execution/tri-mode-dispatcher.ts` (126 LOC) accepts `liveGuard?: LiveExecutionGuard` in its constructor (forwarded by `OrderDispatcher` in `src/desk/execution/order-dispatcher.ts:39`) and stores `private readonly liveGuard?: LiveExecutionGuard`, but `dispatch()` in `LIVE` mode (lines 72–76) increments `this.liveApiCallsCount++` and returns `'FILLED'` without consulting `this.liveGuard`. This item was explicitly noted as deferred in `plans/20261106-backtest-fee-honesty-and-live-fail-closed/plan.md:26` ("the `TriModeDispatcher` facade path").
2. `src/desk/orchestrator/synchronized-risk-gate.ts` (141 LOC) accepts `liveGuard?: LiveExecutionGuard` in `SynchronizedRiskGateOptions`, stores `private readonly liveGuard?: LiveExecutionGuard`, and exposes `getLiveGuard()`, but `validateOrder(intent, unitPrice)` (lines 110–139) never calls `this.liveGuard.guardOrder(...)`.
3. `src/desk/orchestrator/unified-trading-loop.ts` (140 LOC) constructs `this.riskGate` and `this.dispatcher` in its constructor without allowing an optional `liveGuard?: LiveExecutionGuard` to be passed through to both.
4. `plans/20261106-backtest-fee-honesty-and-live-fail-closed/plan.md` line 3 still says `Status: in progress` even though PR #233 (`16e65180`) and PR #235 (`faba2446`) are merged to `main`.
5. `plans/reports/audit-261101-golive-poly/11-handoff.md` Section 1 stops at `Issue #231` and omits the merged SHA `9649eacb` (`PR #232`), `PR #233` (`16e65180`, `Issue #234`), and `PR #235` (`faba2446`).

## Acceptance Criteria (Done means)

- **AC1 (`TriModeDispatcher` & `OrderDispatcher` LIVE guard enforcement):**
  - When `TriModeDispatcher` is in `'LIVE'` mode and `this.liveGuard` is provided, `dispatch()` evaluates `this.liveGuard.guardOrder(...)` with `size: executedQty`, `price: arrivalPrice`, `side: intent.side`, `tokenId: intent.symbol` before incrementing `liveApiCallsCount`.
  - If `guardOrder` returns `{ approved: false, reason }`, `dispatch()` does NOT increment `liveApiCallsCount` and returns a `'REJECTED'` `DispatchResult` with `executedQuantity: 0`, `feeUsd: 0`, `slippageBps: 0`, and `error: guardVerdict.reason ?? 'Rejected by LiveExecutionGuard'`.
  - In `'PAPER'` and `'SHADOW'` modes, or when `liveGuard` is omitted, existing behavior is preserved.
- **AC2 (`SynchronizedRiskGate` & `UnifiedTradingLoop` liveGuard enforcement):**
  - When `SynchronizedRiskGate` has `this.liveGuard` configured and `evaluateOrderRisk` passes, `validateOrder(intent, unitPrice)` evaluates `this.liveGuard.guardOrder(...)` using `size: res.scaledQty`, `price`, `side: intent.side`, `tokenId: intent.symbol`.
  - If `guardOrder` rejects, `validateOrder` returns `approved: false` with `reason: guardRes.reason ?? 'Rejected by LiveExecutionGuard'`.
  - `UnifiedTradingLoop` constructor accepts an optional 4th parameter `liveGuard?: LiveExecutionGuard` and forwards it to both `SynchronizedRiskGate` and `TriModeDispatcher`.
- **AC3 (Plan & Audit Handoff reconciliation):**
  - `plans/20261106-backtest-fee-honesty-and-live-fail-closed/plan.md` is marked `Status: completed` and records PR #233 (`16e65180`) and PR #235 (`faba2446`).
  - `plans/reports/audit-261101-golive-poly/11-handoff.md` Section 1 records `PR #232` (`9649eacb`), `PR #233` (`16e65180`, `Issue #234`), and `PR #235` (`faba2446`).
- **AC4 (Quality gates):**
  - Dedicated unit tests in `src/desk/execution/__tests__/tri-mode-dispatcher-live-guard.test.ts` pass.
  - All `src/desk` and `tests/desk` suites pass, `tsc --noEmit` exits 0, `npm run build:fast` exits 0, all touched files stay ≤ 200 LOC, zero `:any`, zero `console.log`.

## Files

| File | Change |
|------|--------|
| `src/desk/execution/tri-mode-dispatcher.ts` | Enforce `this.liveGuard?.guardOrder(...)` in `LIVE` mode before incrementing `liveApiCallsCount` |
| `src/desk/orchestrator/synchronized-risk-gate.ts` | Enforce `this.liveGuard?.guardOrder(...)` in `validateOrder` after `evaluateOrderRisk` |
| `src/desk/orchestrator/unified-trading-loop.ts` | Accept optional `liveGuard?: LiveExecutionGuard` and forward to `riskGate` and `dispatcher` |
| `src/desk/execution/__tests__/tri-mode-dispatcher-live-guard.test.ts` (new) | Unit tests for `TriModeDispatcher`, `OrderDispatcher`, `SynchronizedRiskGate`, and `UnifiedTradingLoop` with `LiveExecutionGuard` |
| `plans/20261106-backtest-fee-honesty-and-live-fail-closed/plan.md` | Mark `Status: completed` with merged PR #233 / PR #235 SHAs |
| `plans/reports/audit-261101-golive-poly/11-handoff.md` | Record `PR #232` (`9649eacb`), `PR #233` (`16e65180`, `Issue #234`), and `PR #235` (`faba2446`) in Section 1 |

## Validation & Red-Team Check

- **Backward compatibility:** Callers of `new TriModeDispatcher('LIVE')`, `new OrderDispatcher({ initialMode: 'LIVE' })`, `new SynchronizedRiskGate(...)`, and `new UnifiedTradingLoop(...)` that do not pass `liveGuard` experience zero behavioral change.
- **Double-counting prevention:** `LiveExecutionGuard.guardOrder(...)` is a pure read-only evaluation (`evaluateGuardOrder`); it does not mutate `consecutiveLosses`, `dailyPnl`, or `positionTracker`. Calling it in `SynchronizedRiskGate.validateOrder` and/or `TriModeDispatcher.dispatch` is idempotent and side-effect-free.
- **Scaled quantity accuracy:** `SynchronizedRiskGate.validateOrder` passes `res.scaledQty` (after `ALERT`/`REDUCE` tier scaling) rather than raw `intent.quantity` to `liveGuard.guardOrder`, matching the actual order size that will be dispatched.
- **LOC ceiling:** All touched `.ts` files remain well below the 200 LOC ceiling (`tri-mode-dispatcher.ts` ~155 LOC, `synchronized-risk-gate.ts` ~160 LOC, `unified-trading-loop.ts` ~145 LOC, new test file ~160 LOC).

## Unresolved questions

None.
