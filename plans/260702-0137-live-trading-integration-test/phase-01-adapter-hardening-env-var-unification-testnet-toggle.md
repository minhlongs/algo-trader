---
phase: 1
title: "Adapter hardening (env var unification + testnet toggle)"
status: completed
priority: P2
dependencies: []
---

# Phase 1: Adapter Hardening

## Overview

Add `POLY_CLOB_HOST` + `POLY_CHAIN_ID` env var support to the Polymarket execution adapter builder, and unify inconsistent env var naming (`POLY_*` → `POLYMARKET_*`) with backward compatibility.

## Requirements

- Functional: `POLY_CLOB_HOST` overrides CLOB URL. `POLY_CHAIN_ID` overrides chain ID. Both `POLY_*` and `POLYMARKET_*` env var names accepted.
- Non-functional: Backward compatible — old `POLY_*` names still work. Deprecation warning logged when old names used. No breaking changes to CLI or existing tests.

## Architecture

```
process.env.POLY_CLOB_HOST ──→ PolymarketExecutionConfig.clobHost ──→ PolymarketAdapter (base URL)
process.env.POLY_CHAIN_ID  ──→ PolymarketExecutionConfig.chainId  ──→ PolymarketSigner (chain ID)
process.env.POLY_API_KEY   ──→ resolveApiKey()   ──→ PolymarketAdapter (auth)
process.env.POLYMARKET_API_KEY ──→ (same, preferred)
```

`buildPolymarketAdapter()` reads env vars into config object, logs deprecation if old names used, passes to adapter + signer constructors. Existing tests read from env (set in beforeEach) — update test env var names to new scheme.

## Related Code Files

- **Modify:** `src/desk/execution/polymarket-execution-adapter.ts` — add `clobHost`, `chainId` fields to `PolymarketExecutionConfig`, read env vars
- **Modify:** `src/desk/execution/polymarket-adapter.ts` — accept `clobHost` in constructor (already has `apiUrl` param)
- **Modify:** `src/desk/execution/polymarket-signer.ts` — accept `chainId` (already has constructor param, verify)
- **Modify:** `src/desk/cli/cashclaw-trade-commands.ts` — pass env vars to builder
- **Modify:** `src/desk/execution/__tests__/polymarket-adapter.test.ts` — update env var names
- **Modify:** `src/desk/polymarket/clob-client.ts` — verify consistency with `POLY_CLOB_HOST`
- **Read-only:** `src/desk/polymarket/clob-v2-adapter.ts` — reference for `POLYMARKET_*` naming

## Implementation Steps

1. Add `clobHost?: string` and `chainId?: number` to `PolymarketExecutionConfig` interface
2. Add `resolveApiKey()`, `resolveApiSecret()`, `resolveApiPassphrase()`, `resolvePrivateKey()` helpers that check `POLYMARKET_*` first, fall back to `POLY_*`, log deprecation warning
3. Read `POLY_CLOB_HOST` and `POLY_CHAIN_ID` from `process.env` in `buildPolymarketAdapter()`
4. Pass `clobHost` to `PolymarketAdapter` constructor (map to `apiUrl` param)
5. Pass `chainId` to `PolymarketSigner` constructor
6. Update `cashclaw-trade-commands.ts` to pass env config to builder
7. Update adapter unit tests to use new `POLYMARKET_*` naming in test env
8. Add test for deprecation warning when old `POLY_*` names used
9. Add test for `POLY_CLOB_HOST` override
10. Add test for `POLY_CHAIN_ID` override
11. Verify `clob-client.ts` already reads `POLY_CLOB_HOST` — ensure consistency
12. Update `.env.example` with `POLYMARKET_API_KEY`, `POLYMARKET_API_SECRET`, `POLYMARKET_PASSPHRASE`, `POLYMARKET_PRIVATE_KEY`, `POLY_CLOB_HOST`, `POLY_CHAIN_ID` — keep old `POLY_*` names with deprecation comment
<!-- Updated: Validation Session 1 — added .env.example update per scope decision -->

## Success Criteria

- [ ] `POLY_CLOB_HOST` env var overrides CLOB URL in adapter
- [ ] `POLY_CHAIN_ID` env var overrides chain ID in signer
- [ ] All 4 env vars read `POLYMARKET_*` first, `POLY_*` as fallback
- [ ] Deprecation warning logged when `POLY_*` names used
- [ ] Existing adapter tests updated and passing
- [ ] `pnpm typecheck` — 0 errors
- [ ] `.env.example` updated with new `POLYMARKET_*` vars + `POLY_CLOB_HOST` + `POLY_CHAIN_ID`

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Env var rename breaks operators using old `POLY_*` names | Backward compat: read both, warn on old |
| `POLYMARKET_*` already used by `clob-v2-adapter.ts` with different semantics | Verify no conflict — use same names with same values |
| Chain ID change breaks EIP-712 signing (wrong domain) | Default to 137. Only override when `POLY_CHAIN_ID` explicitly set |
