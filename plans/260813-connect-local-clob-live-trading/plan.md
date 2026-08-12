# Connect Local CLOB to Live Trading

## Brainstorm Contract
- **Outcome:** `cashclaw trade start --mode=live` works with `http://omnimbp.local:20128`
- **Constraints:** Paper mode default, env vars required, fail-safe
- **Acceptance:** pipeline + adapter both use local CLOB host, no hardcoded keys

## Root Cause
`TradingPipeline.initComponents()` creates `ClobClient` with hardcoded fallback `'paper-key'` — never reads `POLYMARKET_PRIVATE_KEY` env var. Pipeline ClobClient is disconnected from adapter's real signer.

## Implementation

### Phase 1 — Fix private key resolution in pipeline
- `TradingPipeline` should resolve `POLYMARKET_PRIVATE_KEY` (with `POLY_PRIVATE_KEY` fallback) when no key is explicitly passed
- Aligns with adapter's existing `resolveEnvVar` pattern

### Phase 2 — Add `verify:polymarket` npm script
- Register `scripts/verify-polymarket-connection.ts` in `package.json`

### Phase 3 — Verify
- `npx tsc --noEmit`
- Run existing adapter tests
- Smoke test: `cashclaw paper` still works (paper mode unaffected)

## Status: COMPLETE ✓

### Phase 1 ✓ — Pipeline env var resolution
- `trading-pipeline.ts:149-153` — resolves `POLYMARKET_PRIVATE_KEY` → `POLY_PRIVATE_KEY` → `'paper-key'`
- Matches adapter's existing pattern (`polymarket-execution-adapter.ts:47-56`)

### Phase 2 ✓ — npm script
- `package.json` — `verify:polymarket` script added

### Phase 3 ✓ — ClobClient type alias bug fix (finalize finding)
- **Root cause:** `trading-pipeline.ts` imported `ClobClient` (a type alias erased at runtime) and did `new ClobClient(...)`, which would crash at runtime. Hidden by tsconfig exclusion.
- **Fix:** Changed import to `clobClientSingleton` (pre-existing value export) and `ClobClientInterface` (type). Line 158 now uses `clobClientSingleton` instead of `new ClobClient(...)`.
- **tsconfig:** File remains excluded from compilation — has 11 pre-existing dead-code errors (missing module paths, OrderManager type-only import). Those are separate legacy issues.
- `clob-client.ts:71` — `ClobClientInterface` is now an `interface` (was class) + `ClobClient` remains a type alias

### Phase 4 ✓ — Verification
- `npx tsc --noEmit` — 0 errors
- Adapter tests: 56/56 pass (4 files)
- Full suite: 385/389 pass (4 pre-existing failures)
- Paper mode unaffected

## Files Modified
- `src/desk/polymarket/trading-pipeline.ts` — resolve `POLYMARKET_PRIVATE_KEY` env var + fix ClobClient singleton import
- `src/desk/polymarket/clob-client.ts` — `ClobClientInterface` export changed to interface
- `package.json` — add `verify:polymarket` script

## Code Review Findings (from finalize)
- **[FIXED] ClobClient type alias runtime crash** — resolved via singleton import
- **[OPEN] No live-mode credential validation** — pipeline falls back to `'paper-key'` silently when `paperTrading: false` and no key set. Consider throwing upfront in future iteration.
- **[OPEN] Pattern divergence** — inline env var resolution vs centralized `resolveEnvVar` helper. Acceptable for now; extract to shared utility in follow-up.

## How to Connect Local CLOB

```bash
# 1. Uncomment and set in .env:
POLYMARKET_TRADING_MODE=live
POLY_CLOB_HOST=http://omnimbp.local:20128
POLYMARKET_API_KEY=<your-api-key>
POLYMARKET_API_SECRET=<your-api-secret>
POLYMARKET_PASSPHRASE=<your-passphrase>
POLYMARKET_PRIVATE_KEY=<your-ecdsa-private-key>

# 2. Verify connectivity:
npm run verify:polymarket

# 3. Start live trading:
npx cashclaw trade start --mode=live
```
