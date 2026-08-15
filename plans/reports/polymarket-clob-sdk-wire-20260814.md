# Polymarket CLOB SDK Wiring Findings

## Summary
Replaced the local Polymarket CLOB stub with a lazy wrapper around the installed `@polymarket/clob-client` v1 SDK.

## Changes
- `src/desk/polymarket/clob-client.ts`
  - Imports the real SDK `ClobClient`, `Chain`, and `Side`.
  - Lazily constructs `new ClobClient(CLOB_HOST, Chain.POLYGON)`.
  - Uses `POLY_CLOB_HOST` with `https://clob.polymarket.com` fallback.
  - Converts SDK order-book values to the stable local strategy shape.
  - Preserves `ClobClientInterface`, `ClobClient`, `RawOrderBook`, singleton `clobClient`, and `cancelOrder` exports.
  - Keeps error behavior: order-book failures return an empty book; price/midpoint failures log and rethrow.
- `src/desk/execution/twap-executor.ts`
  - Retained existing one-argument `getPrice` contract for the arrival-price benchmark.

## Verification
- `npx tsc --noEmit` — passed with 0 errors.
- Polymarket-related Vitest files — 3 files / 39 tests passed.
- Full `npx vitest run` — 402 files / 4461 tests passed, process exit 0.
- Vitest reported one unrelated unhandled `DB connection lost` rejection from `audit-trail-e2e.test.ts`; it did not fail the suite and is outside this change.

## Scope Check
- `neg-risk-scan.ts`, `clob-v2-adapter.ts`, and strategy files were not modified.
