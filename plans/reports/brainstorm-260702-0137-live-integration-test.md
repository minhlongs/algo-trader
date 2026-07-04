# Brainstorm: Live Trading Integration Test + Adapter Hardening

**Date:** 2026-07-02 | **Source:** /brainstorm "next plan --deep --parallel"
**Flags:** --deep --parallel
**Direction:** Live testnet integration test (recommended option)

## Problem Statement

Polymarket live trading infrastructure is fully coded (CLOB adapter, HMAC signer, order manager, position tracker, execution guard, journal, orchestrator) — all unit-tested — but zero integration tests validate the pipeline end-to-end. No tests exercise real Gamma API data flowing through the orchestrator. Additionally, the adapter hardcodes mainnet (chainId 137, CLOB URL) with no testnet/config override, and env var naming is inconsistent (`POLY_*` vs `POLYMARKET_*`).

Polymarket has no public testnet CLOB. The viable approach is paper-mode E2E using real Gamma API data + paper executor.

## Scout Findings

- **All components unit-tested** (adapter, signer, guard, tracker, journal, orchestrator) — 7 test files
- **CLOB adapter** production-grade: EIP-712 signing via ethers, HMAC-SHA256 auth, REST order placement
- **No testnet toggle** — chainId 137 hardcoded, CLOB URL `https://clob.polymarket.com` everywhere
- **Two env var schemes** — `POLY_*` (raw adapter/builder) vs `POLYMARKET_*` (v2 SDK)
- **Guard disabled by default** — operator must explicitly enable
- **2783 tests pass**, 0 type errors, 92 lint warnings
- **CLI**: `algo trade start --mode=live` validates 4 env vars, prompts confirmation

## Evaluated Approaches

| # | Approach | Risk | Verdict |
|---|----------|------|---------|
| A | Paper-mode E2E: real Gamma API + paper executor | Zero (no keys) | **SELECTED** |
| B | Live read-only: real CLOB GET endpoints | Zero (read-only) | Deferred — combine with A later |
| C | Live micro-trade: real $1 order on Polygon | $1 + gas | Out of scope — needs operator credentials |

## Final Solution

### Track 1: Paper-mode E2E Integration Test

**File:** `src/desk/polymarket/__tests__/live-trading-integration.test.ts` (NEW, ~15 tests)

Test coverage:
1. Gamma API connectivity — fetch real markets, validate response schema
2. Strategy scanEntries — real markets → non-empty signal list
3. Paper order placement — orchestrator → order ID returned
4. Position tracking — open → mark-to-market → close → P&L verified
5. Journal persistence — trades JSONL, positions JSON written
6. Execution guard — position cap, drawdown, circuit breaker checks
7. Orchestrator lifecycle — start → orders → stop → restore state
8. Error handling — Gamma timeout, invalid data, missing fields

### Track 2: Adapter Hardening

**Touchpoints:**
- `execution/polymarket-adapter.ts` — accept `clobHost` + `chainId` in constructor
- `execution/polymarket-execution-adapter.ts` — add `POLY_CLOB_HOST` + `POLY_CHAIN_ID` env fallback
- `execution/polymarket-signer.ts` — already has chainId param, verify
- `cli/cashclaw-trade-commands.ts` — pass config through

**Env var unification:**
- Old → New: `POLY_*` → `POLYMARKET_*` (4 vars)
- Backward compat: read both names, deprecation warning on old names
- New vars: `POLY_CLOB_HOST` (default `https://clob.polymarket.com`), `POLY_CHAIN_ID` (default 137)

## Success Criteria

- [ ] 12-15 E2E tests pass without real API keys
- [ ] `POLY_CLOB_HOST` env var overrides CLOB URL
- [ ] All 4 env vars accept both old (`POLY_*`) and new (`POLYMARKET_*`) names
- [ ] Chain ID configurable via `POLY_CHAIN_ID` env var
- [ ] 2783 existing tests still pass
- [ ] 0 TypeScript errors
- [ ] ≤95 lint warnings (allow up to 3 new for deprecation warnings)

## Implementation Risks

| Risk | Mitigation |
|------|-----------|
| Gamma API rate limit in CI | Mock fallback if API unavailable; test marked skip |
| Env var rename breaks operators | Backward compat: read both, warn on old |
| E2E test flaky (network) | 10s timeout, retry once, skip on persistent failure |

## Out of Scope

- Real-money trading (no mainnet orders)
- CEX adapters (Binance, Bybit, etc.)
- WebSocket fill detection
- Frontend/dashboard changes
- Removal of deprecated `POLY_*` env names (follow-up)

## Next Steps

Hand off to `/ck:plan` for phased implementation breakdown.
