# POLY-G8.4 — GhostGuard & StrategyRunner Reliability Analysis (Issue #286)

- **Document ID:** `POLY-G8.4-06`
- **Date:** 2026-11-21
- **Issue:** `#286`
- **Remediation PR:** Draft PR `#289` (`fix/poly-g8-4-reliability-286`, HEAD `a9463d95`)
- **Verdict:** `ISSUE_286_RELIABILITY = PASS (remediated in Draft PR #289; GhostGuard <100 ms threshold preserved)`

---

## 1. Root Cause Investigation

Issue `#286` reported two load-sensitive failures under parallel full-suite execution:

### A. `StrategyRunner` Re-entrancy & `maxTicks` Race + Live Network Coupling

1. **Runtime Re-entrancy Defect (`src/desk/polymarket/strategy-runner-executor.ts`, `src/desk/polymarket/strategy-runner.ts`):**
   - `StrategyRunner` schedules periodic timer ticks and also subscribes to `PRICE_UPDATE` event-bus callbacks.
   - Without a shared in-flight execution guard across timer and event-driven triggers plus a pre-execution `maxTicks` check, slow async ticks under CPU/IO contention could overlap or exceed `maxTicks` before the prior tick settled.
2. **Test Isolation Defect (`src/desk/polymarket/__tests__/strategy-runner-lifecycle.test.ts`):**
   - Lifecycle tests invoked default `GammaClient` / `ClobClient` dependencies without injecting offline stubs, making unit tests sensitive to network/event-loop latency under heavy Vitest concurrency.

### B. GhostGuard Webhook Bridge (`tests/polymarket/ghost-guard-webhook-bridge.test.ts`)

- Inspected `src/desk/polymarket/ghost-guard-webhook-bridge.ts` and `tests/polymarket/ghost-guard-webhook-bridge.test.ts` in full.
- Server-side HMAC verification and circuit-breaker latch execute in sub-millisecond time; sequential loopback execution completes in **25 ms** (well under the `<100 ms` safety SLA).
- The `<100 ms` kill-switch latency assertion is a hard safety invariant and was **strictly preserved without relaxation**.
- GhostGuard Rust sidecar (`sidecars/ghost-guard/`) passed **54/54** unit tests (`1 ignored`, `0 failed`, `0.12s`), verifying HMAC signing, 5xx retry with fresh nonce, fail-closed 401 handling, and bounded timeout behavior.

---

## 2. Targeted Remediation (Draft PR #289)

- **Branch:** `fix/poly-g8-4-reliability-286`
- **Commit:** `a9463d95` (`fix(polymarket): guard StrategyRunner tick re-entrancy and isolate lifecycle tests (#286)`)
- **Changes:**
  - `src/desk/polymarket/strategy-runner-executor.ts`: Added `getIsExecuting` / `setIsExecuting` hooks on `StrategyExecutionContext`, pre-execution `maxTicks` guard, and `try { ... } finally { ctx.setIsExecuting?.(false); }` lock release.
  - `src/desk/polymarket/strategy-runner.ts`: Routed both timer ticks and `PRICE_UPDATE` event-bus handlers through the shared execution lock.
  - `src/desk/polymarket/__tests__/strategy-runner-lifecycle.test.ts`: Injected deterministic offline `gamma` and `clob` dependencies with zero-fetch assertions across all 6 original tests, plus 3 deterministic slow-tick regression tests (`maxTicks: 1`, `maxTicks: 2`, concurrent `PRICE_UPDATE`).

---

## 3. Verification Evidence

| Check | Command | Exit Code | Result |
|---|---|---|---|
| Lifecycle + GhostGuard bridge | `npx vitest run src/desk/polymarket/__tests__/strategy-runner-lifecycle.test.ts tests/polymarket/ghost-guard-webhook-bridge.test.ts` | `0` | `13/13` passed (`6.28s`; GhostGuard loopback `25 ms < 100 ms`) |
| All StrategyRunner tests | `npx vitest run src/desk/polymarket/__tests__/strategy-runner*.test.ts` | `0` | `41/41` passed (`5.98s`) |
| GhostGuard Rust sidecar | `CC=/usr/bin/cc CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=/usr/bin/cc cargo test --manifest-path sidecars/ghost-guard/Cargo.toml` | `0` | `54 passed, 0 failed, 1 ignored` (`0.12s`) |
| Typecheck & Lint (touched files) | `npx tsc --noEmit && npx eslint --max-warnings 0 <touched files>` | `0` | `0 errors, 0 warnings` |
| CI Test Suite (PR #289) | GitHub Actions `Test Suite` | `0` | Passed (`4m33s`) |
