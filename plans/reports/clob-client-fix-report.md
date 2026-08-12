# ClobClient Type Alias Bug Fix Report

**Date:** 2026-08-12
**Status:** COMPLETED
**Severity:** Runtime crash (prevented by tsconfig exclusion)

---

## Summary

Fixed a type alias runtime crash bug in the Polymarket trading pipeline. `ClobClient` was exported as a type alias (`export type ClobClient = ClobClientInterface`), but `trading-pipeline.ts` attempted to instantiate it with `new ClobClient(...)`, which crashes at runtime since type aliases are erased during compilation.

---

## Problem Analysis

### Root Cause
- `clob-client.ts` line 77: `export type ClobClient = ClobClientInterface;`
- `trading-pipeline.ts` line 158: `this.clobClient = new ClobClient(resolvedKey, this.cfg.chainId);`
- `tsconfig.json` line 42: `trading-pipeline.ts` was excluded from type checking, hiding the error

### Why It Didn't Fail Before
The tsconfig `exclude` array included `trading-pipeline.ts`, so `tsc --noEmit` never type-checked this file. The runtime error was only caught if the pipeline was actually executed.

---

## Fix Applied

**Option B: Use the pre-existing singleton**

### Changes Made

1. **`src/desk/polymarket/trading-pipeline.ts`** (3 edits)

   - **Line 4:** Changed import from `ClobClient` (type alias) to `clobClient` singleton
     ```typescript
     // Before:
     import { ClobClient } from './clob-client';

     // After:
     import { clobClient as clobClientSingleton, ClobClientInterface } from './clob-client';
     ```

   - **Line 54:** Changed property type annotation
     ```typescript
     // Before:
     private clobClient!: ClobClient;

     // After:
     private clobClient!: ClobClientInterface;
     ```

   - **Line 158:** Replaced instantiation with singleton assignment
     ```typescript
     // Before:
     this.clobClient = new ClobClient(resolvedKey, this.cfg.chainId);

     // After:
     this.clobClient = clobClientSingleton;
     ```

2. **`tsconfig.json`** (1 edit)

   - Removed `trading-pipeline.ts` from the `exclude` array (line 42)
     ```json
     // Before:
     "exclude": [
       "node_modules",
       "node_modules/.cache",
       "**/*.test.ts",
       "src/platform/workers/**/*",
       "src/platform/dashboard/**/*",
       "src/platform/landing/**/*",
       "src/wiring/**/*",
       "src/desk/wiring/**/*",
       "dist",
       "src/desk/polymarket/trading-pipeline.ts"
     ]

     // After:
     "exclude": [
       "node_modules",
       "node_modules/.cache",
       "**/*.test.ts",
       "src/platform/workers/**/*",
       "src/platform/dashboard/**/*",
       "src/platform/landing/**/*",
       "src/wiring/**/*",
       "src/desk/wiring/**/*",
       "dist"
     ]
     ```

---

## Verification Results

### Type Check

```
npx tsc --noEmit
```

**Result:** The `ClobClient` type alias error is **FIXED** (no longer appears).

**Note:** Enabling type checking for `trading-pipeline.ts` exposed 11 pre-existing errors:
- 4 missing module imports (cross-market-arb, market-maker, mean-reversion, trading-event-bus)
- 4 missing OrderManager methods (cancelAllOpen, stopStalePoll, startStalePoll, etc.)
- 2 implicit `any` type parameters
- 1 type access error on StrategyRunner.strategies

These are pre-existing issues that existed while the file was excluded from type checking.

### Unit Tests

```
npx vitest run src/desk/polymarket
```

**Result:** ✅ **56/56 Polymarket adapter tests pass**

All tests in:
- `src/desk/polymarket/__tests__/clob-client.test.ts`
- `src/desk/polymarket/__tests__/market-scanner.test.ts`
- `src/desk/polymarket/__tests__/orderbook-stream.test.ts`
- `src/desk/polymarket/__tests__/order-manager.test.ts`
- `src/desk/polymarket/__tests__/prediction-loop.test.ts`

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Fix breaks existing functionality | Low | Tests pass; singleton already provides required methods |
| Exposing pre-existing errors in tsconfig | Medium | Expected; these were hidden bugs now visible |
| Runtime type mismatch | Low | Singleton implements ClobClientInterface correctly |

---

## Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `src/desk/polymarket/trading-pipeline.ts` | Import, type annotation, singleton assignment | 3 lines |
| `tsconfig.json` | Remove exclude entry | 1 line |

**Total:** 2 files, 4 lines changed

---

## Next Steps

### Immediate (Optional)
1. Fix the 11 pre-existing type errors in `trading-pipeline.ts` now that it's included in type checking
2. Create stub files for missing modules (cross-market-arb, market-maker, mean-reversion, trading-event-bus)

### Deferred (TODO in clob-client.ts)
1. Install `@polymarket/clob-client-v2` package
2. Implement real ClobClient class with proper authentication
3. Update singleton to use real implementation instead of stubs

---

## Unresolved Questions

1. **Should we fix the pre-existing type errors now?** The 11 errors exposed by enabling type checking represent incomplete stub implementations that were hidden.
2. **Is the singleton approach correct for production?** The current singleton ignores `privateKey` and `chainId` parameters. When the real ClobClient is implemented, this may need refactoring.

---

## Conclusion

The ClobClient type alias runtime crash is **FIXED**. The trading pipeline will now correctly use the pre-existing singleton instead of attempting to instantiate a type alias. All Polymarket adapter tests pass. The tsconfig exclusion has been removed, making future type errors visible.
