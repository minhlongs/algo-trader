# Journal: Connect Local CLOB to Live Trading — Finalize

**Date:** 2026-08-13
**Session:** Cook finalize (--auto --parallel)
**Commit:** 4a6f97c5

## What happened

Previous session implemented env var resolution for `POLYMARKET_PRIVATE_KEY` in `trading-pipeline.ts` and added `verify:polymarket` script. This session finalized by fixing a critical code review finding.

### ClobClient type alias bug (BLOCKER found during review)

`trading-pipeline.ts` imported `ClobClient` — a **type alias** (`export type ClobClient = ClobClientInterface` in `clob-client.ts:77`) that is erased at runtime. Line 158 did `new ClobClient(resolvedKey, this.cfg.chainId)` which would crash with `TypeError: resolvedKey is not a constructor`.

**Root cause:** The file was excluded from `tsconfig.json` (line 42), so `tsc --noEmit` never type-checked it. The bug was invisible to the compiler.

**Fix:** Changed import from `ClobClient` to `clobClientSingleton` (pre-existing value export from `clob-client.ts`) and `ClobClientInterface` (type for annotations). Line 158 now does `this.clobClient = clobClientSingleton` — no constructor call needed.

**tsconfig decision:** Kept `trading-pipeline.ts` excluded. Removing the exclusion surfaced 11 pre-existing dead-code errors (missing module paths for strategies, OrderManager type-only import, etc.) that are unrelated legacy issues. Fixing those would be scope creep.

## Verification

- `npx tsc --noEmit` — 0 errors
- Polymarket adapter tests — 56/56 pass (4 files)
- Full suite — 385/389 pass (4 pre-existing failures)
- Paper mode unaffected

## Code review findings (from finalize)

| Severity | Finding | Status |
|----------|---------|--------|
| CRITICAL | ClobClient type alias runtime crash | **FIXED** |
| HIGH | No live-mode credential validation | OPEN — future iteration |
| HIGH | Pattern divergence (inline vs centralized env var resolver) | OPEN — acceptable for now |
| MEDIUM | No test coverage for env var resolution | OPEN — future iteration |

## Files touched

- `src/desk/polymarket/trading-pipeline.ts` — ClobClient singleton import + env var resolution
- `src/desk/polymarket/clob-client.ts` — no change (already had interface export)
- `package.json` — `verify:polymarket` script (committed earlier)

## How to connect local CLOB

```bash
# 1. Set in .env:
POLYMARKET_TRADING_MODE=live
POLY_CLOB_HOST=http://omnimbp.local:20128
POLYMARKET_API_KEY=<your-api-key>
POLYMARKET_API_SECRET=<your-api-secret>
POLYMARKET_PASSPHRASE=<your-passphrase>
POLYMARKET_PRIVATE_KEY=<your-ecdsa-private-key>

# 2. Verify:
npm run verify:polymarket

# 3. Start live trading:
npx cashclaw trade start --mode=live
```

## Unresolved questions

- Is `src/desk/polymarket/trading-pipeline.ts` intentionally kept as legacy, or should it be removed? The `clob-v2-adapter.ts` and `src/desk/trading-pipeline.ts` appear to be its successors.
- Should `buildPolymarketAdapter` throw when credentials are missing in live mode, or is silent fallback to paper acceptable? User hasn't decided.
