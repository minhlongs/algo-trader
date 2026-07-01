# PR #212 Review: pr-merge-pr3 vs origin/main

**Date:** 2026-06-27  
**Scope:** 16 files changed, 380 insertions, 164 deletions  
**Focus:** Restoring 6 Polymarket strategies from PR #3 with edge-case fixes

---

## CRITICAL Findings

### 1. engine.ts + engine.test.ts — Type/shape mismatch will break tests

**Files:** `src/engine.ts`, `src/engine.test.ts`

`engine.ts` was rewritten to import `Order` from `./core/types`, whose shape is:
```typescript
{ id: string; marketId: string; side: OrderSide; price: string; size: string; status: OrderStatus; type: 'limit'|'market'; createdAt: number; filledAt?: string }
```

`engine.test.ts` still constructs orders with the **old shape**:
```typescript
{ symbol: 'AAPL', quantity: 100, price: 150.00, side: 'buy', timestamp: new Date() }
```

Problems:
- `symbol` → should be `marketId` (string)
- `quantity` → should be `size` (string)
- `price: 150.00` (number) → should be `"150.00"` (string)
- `timestamp: new Date()` → should be `createdAt: Date.now()` (number)
- Test asserts `orders[0].symbol` — field doesn't exist on new type
- `engine.test.ts` imports `Order` from `'./engine'`, but `engine.ts` does not re-export `Order` (it only imports it internally). This import will fail at compile time.

**Impact:** Tests will fail to compile and run. The `TradingEngine` class is also used by `src/api/routes/health.ts` (line 54) which only calls `new TradingEngine()` and `getOrders()` — that path is unaffected since it doesn't construct Order objects.

### 2. kelly-position-sizer.ts — Logger import removed but logger calls remain

**File:** `src/risk/kelly-position-sizer.ts`

The diff removes `import { logger } from '../utils/logger';` but the code still calls:
- `logger.info(...)` on line 51 (managed capital cap message)
- `logger.warn(...)` on line 61 (invalid winLossRatio warning)

**Impact:** Runtime `ReferenceError: logger is not defined` when either code path executes. The `logger.info` path triggers whenever `isManagedCapital` is true and fraction exceeds 0.25 — a common configuration.

---

## HIGH Findings

### 3. order-manager.ts — Confusing overload with incompatible return types

**File:** `src/polymarket/order-manager.ts`

The interface has two `placeOrder` overloads:
```typescript
// Overload A: string price/size → returns { id: string }
placeOrder(params: { price: string; size: string; ... }): Promise<{ id: string }>;
// Overload B: number price/size → returns string
placeOrder(params: { price: number; size: number; }): Promise<string>;
```

All 30+ strategy call sites pass string price/size and access `.id` on the result (e.g., `order.id`). TypeScript resolves to overload A for these calls. However, overload B returns `Promise<string>` — if any caller passes numbers, they'd get a string and `order.id` would be `undefined` at runtime.

**Impact:** Not a current runtime bug (all callers use strings), but the overload is misleading and creates a latent defect. Any future caller passing numbers would silently get `undefined` order IDs.

### 4. trading-pipeline.ts — recordTradeOutcome is async but no external callers found

**File:** `src/trading-pipeline.ts`

The interface changed from `recordTradeOutcome(...): void` to `Promise<void>`. The implementation was updated to `async` and uses `await wallet.recordTrade(...)`. However, a grep across the entire codebase found **zero callers** of `recordTradeOutcome` outside the interface declaration itself.

**Impact:** If any consumer code (RaaS subscriber, arbitrage loop, etc.) calls `pipeline.recordTradeOutcome(...)` without `await`, the trade won't be recorded and no error will surface. The change is correct but the feature appears disconnected from any caller.

### 5. gamma-client.ts — yesTokenId made required, removing defensive filter contract

**File:** `src/polymarket/gamma-client.ts`

The field `yesTokenId` changed from optional (`yesTokenId?: string`) with an explicit comment warning strategies to filter for its presence, to required (`yesTokenId: string`). Multiple strategies still guard with `m.yesTokenId && ...` — these guards are now dead code but harmless.

**Impact:** If the Gamma API ever returns a market without `yesTokenId`, the type system won't catch it and strategies will get `undefined` token IDs passed to CLOB calls, causing runtime errors in the SDK.

---

## MEDIUM Findings

### 6. wallet-manager.ts — saveState() marked async but does synchronous I/O

**File:** `src/wallet/wallet-manager.ts`

`saveState()` is now `async` but calls `writeJsonState()` which is synchronous (`function writeJsonState<T>(filePath: string, state: T): void`). The `await this.saveState()` in `recordTrade` resolves immediately after the sync write. Meanwhile, `registerWallet()` calls `this.saveState()` without `await` on line 72, creating an unhandled promise (which resolves instantly due to the sync body, so no visible bug).

**Impact:** No functional bug today, but the async label is misleading. If `writeJsonState` is ever made truly async (e.g., `fs.promises.writeFile`), the missing `await` in `registerWallet` would become a real race condition.

### 7. twap-executor.ts — activeInstances Set can leak instances

**File:** `src/execution/twap-executor.ts`

The new instance registry (`TwapExecutor.activeInstances`) adds `this` in the constructor but `destroy()` must be called explicitly to remove it. If a caller creates a `TwapExecutor` and never calls `destroy()`, the instance stays in the Set forever, preventing garbage collection and keeping signal handlers alive.

**Impact:** Memory leak in long-running processes that create/destroy TWAP executors. The signal handlers will also fire for dead instances.

### 8. license-validation.ts — Module-level cache has no invalidation for renewed licenses

**File:** `src/middleware/license-validation.ts`

The 60-second TTL cache stores license results. If a license expires and is later renewed within the TTL window, the cache will serve the stale "expired" result until TTL expires.

**Impact:** A renewed license could be rejected for up to 60 seconds. Low probability in practice but could cause confusion during license renewals.

### 9. engine.ts — Removed thread-safety for concurrent executeOrder calls

**File:** `src/engine.ts`

The new `executeOrder` has an `executing` flag that rejects concurrent calls with "Engine busy, retry later". The old implementation had no such guard. `health.ts` creates a throwaway `TradingEngine` instance for health checks — if a health check coincides with a real order execution in the same process (unlikely but possible with shared instances), the health check would fail.

**Impact:** Low — health checks use separate instances. But if any code shares a `TradingEngine` instance across requests, the busy flag could cause spurious failures.

---

## LOW Findings

### 10. engine.ts — deepCloneOrder is a shallow clone

**File:** `src/engine.ts`

`deepCloneOrder` does `{ ...order }` which is a shallow spread. For the new `Order` type (all primitive fields), this is effectively correct. The function name is misleading — it's not a deep clone.

**Impact:** None today (Order has no nested objects), but the name suggests deeper cloning than what happens.

### 11. trading-pipeline.ts — Drawdown check uses stale portfolio value

**File:** `src/trading-pipeline.ts`

The drawdown breaker is checked with `newPortfolioValue` before the trade is recorded. If the trade's PnL significantly changes the portfolio value, the drawdown check uses the pre-trade value. This is actually the correct behavior (check before executing), but the comment says "checks drawdown BEFORE mutating wallet" which implies the check is on the post-trade value.

**Impact:** None — the ordering is correct. The comment is slightly misleading.

### 12. kelly-position-sizer.ts — Removed kellyFraction clamping

**File:** `src/risk/kelly-position-sizer.ts`

The diff removes `const clampedFraction = Math.max(MIN_KELLY_FRACTION, Math.min(MAX_KELLY_FRACTION, requestedFraction))` from the constructor. The clamping logic was moved... but it's gone entirely. If `process.env.KELLY_FRACTION` is set to an invalid value (e.g., `2.0` or `-0.5`), it will be used directly without clamping.

**Impact:** An invalid env var could set kellyFraction outside the 0.1-0.5 range, causing extreme position sizes. The `isManagedCapital` path still caps at 0.25, but non-managed capital has no guard.

---

## INFO Findings

### 13. CORS origin list expanded

**File:** `src/api/server.ts`

Added 4 new CORS origins: `cashclaw-dashboard.pages.dev`, `agencyos.network`, `sophia.agencyos.network`, `raas-landing.pages.dev`. No security concerns — these are standard Pages.dev and subdomain patterns.

### 14. arbitrage/trading-loop.ts — Backpressure and O(1) percentile

**File:** `src/arbitrage/trading-loop.ts`

Added opportunity queue with max 50 entries, default arb amount/fee rate config, opportunity TTL, and an O(1) amortized running median for p95 (replacing full sort). The "medianAtPercentile" is actually just `samples[floor(n * p)]` which is not a true median but an order-statistic approximation. Fine for latency tracking.

### 15. No hardcoded secrets or credentials found

All API keys/passphrases are read from `process.env`. No hardcoded tokens, private keys, or passwords found in any changed file.

---

## Summary Table

| # | File | Severity | Description |
|---|------|----------|-------------|
| 1 | engine.ts + engine.test.ts | CRITICAL | Test uses old Order shape; won't compile |
| 2 | kelly-position-sizer.ts | CRITICAL | Logger import removed, calls remain → ReferenceError |
| 3 | order-manager.ts | HIGH | Confusing overload; number path returns string not {id} |
| 4 | trading-pipeline.ts | HIGH | recordTradeOutcome async but no external callers found |
| 5 | gamma-client.ts | HIGH | yesTokenId required; removes defensive null-check contract |
| 6 | wallet-manager.ts | MEDIUM | saveState() async but sync I/O; missing await in registerWallet |
| 7 | twap-executor.ts | MEDIUM | activeInstances Set leaks if destroy() never called |
| 8 | license-validation.ts | MEDIUM | Cache serves stale "expired" for renewed licenses within TTL |
| 9 | engine.ts | MEDIUM | Busy flag could cause spurious health-check failures |
| 10 | engine.ts | LOW | deepCloneOrder is shallow despite name |
| 11 | trading-pipeline.ts | LOW | Comment slightly misleading about drawdown check timing |
| 12 | kelly-position-sizer.ts | LOW | kellyFraction clamping removed from constructor |
| 13 | server.ts | INFO | CORS origins expanded — no issues |
| 14 | trading-loop.ts | INFO | Backpressure and O(1) percentile added |
| 15 | All files | INFO | No hardcoded secrets found |

---

## Recommended Actions Before Merge

1. **Fix engine.test.ts** — Update all Order constructors to match the new `core/types.ts` shape (`marketId`, `size` as string, `price` as string, `createdAt` as number). Fix `orders[0].symbol` assertions to use `marketId`. Ensure `Order` is re-exported from `engine.ts` or import it directly from `core/types`.

2. **Restore logger import** in `kelly-position-sizer.ts` — Add back `import { logger } from '../utils/logger';`.

3. **Clean up order-manager.ts overloads** — Remove the number-typed overload or make both return `{ id: string }` for consistency.

4. **Verify recordTradeOutcome callers** — Search RaaS subscriber, arbitrage loop, and any orchestration code for callers that need `await` added.

5. **Add kellyFraction clamping** — Restore the `Math.max(MIN, Math.min(MAX, ...))` guard in the constructor for non-managed capital paths.

6. **Consider adding destroy() calls** — Document that `TwapExecutor.destroy()` must be called, or use `WeakRef`/`FinalizationRegistry` for automatic cleanup.
