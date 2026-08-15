# ClobClient Pipeline Wiring — Findings

**Date:** 2026-08-14
**File modified:** `src/desk/trading-pipeline.ts`

## What changed

4 edits to `src/desk/trading-pipeline.ts` (now ~136 lines):

1. **Import** (line 19): `import type { ClobClientInterface } from './polymarket/clob-client'`
2. **Interface field** (line 48): Added `clobClient?: ClobClientInterface` to `TradingPipeline` interface
3. **Factory param** (line 61): Added `providedClobClient?: ClobClientInterface` as 4th parameter to `createTradingPipeline`
4. **Return wiring** (line 82): `...(providedClobClient && { clobClient: providedClobClient })` — conditional spread only includes field when provided

## Backward compatibility

All existing callers pass 2 or 3 args to `createTradingPipeline(config, sharedWallet?, sharedAudit?)`. Adding a 4th optional parameter is fully backward-compatible — no existing call site breaks.

`clobClient` is optional on the interface (`clobClient?`), so strategies that access `pipeline.clobClient` must already guard with `if (pipeline.clobClient)` or fall back to the singleton `clobClient` from `./polymarket/clob-client`. No strategy or wiring code was changed.

## Type check

`npx tsc --noEmit` — zero errors from trading-pipeline.ts. 5 pre-existing errors exist in `clob-client.ts` (SDK type narrowing, `twap-executor.ts` arg count) — unrelated, not introduced by this change.

## Tests

No test file exists for `trading-pipeline.ts` (confirmed via grep of tests/ and vitest filter). No test breakage possible.

## Trade-offs

- Using conditional spread `...(clobClient && { clobClient })` instead of always assigning `clobClient: providedClobClient ?? undefined`. Both work; spread avoids adding an explicit `undefined` key to the returned object literal.
- `ClobClientInterface` is imported as `type` only — no runtime import cost, tree-shake safe.
- Strategies that need the CLOB client can now pull it from `pipeline.clobClient` when available, or continue using the `clobClient` singleton. This gives pipeline callers explicit control over which CLOB client instance is shared across strategies.

## Unresolved questions

- None.
