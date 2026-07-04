# Phase 01: Polymarket Execution Adapter Builder

**Priority:** P0 | **Status:** complete | **Depends on:** none

## Context Links
- Brainstorm: `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
- Plan overview: `plan.md`
- Source: `src/desk/execution/polymarket-adapter.ts` (218 lines, HMAC already implemented)
- Signer: `src/desk/execution/polymarket-signer.ts` (150 lines, EIP-712 already implemented)

## Overview

`trading-pipeline.ts:15` imports `buildPolymarketAdapter` from `./polymarket-execution-adapter.js` but the source file doesn't exist. This phase creates the missing builder — a factory function that wires `PolymarketAdapter` + `PolymarketSigner` with risk manager, order manager, paper exchange, and DB into a single execution interface used by the pipeline.

## Key Insights

- `PolymarketAdapter` constructor requires `PolymarketSigner` + optional `apiUrl`
- `PolymarketSigner` constructor requires `privateKey` + optional `chainId` — throws on paper keys
- PAPER mode: use `PaperExchange` (existing, fully functional) — signer not created
- LIVE mode: create real `PolymarketSigner` + `PolymarketAdapter` — signer validates key format
- Env vars: `POLY_API_KEY`, `POLY_API_SECRET`, `POLY_PASSPHRASE`, `POLY_PRIVATE_KEY`

## Requirements

### Functional
- Builder accepts: `riskManager`, `orderManager`, `orderbookStream`, `paperExchange`, `db`, `capitalUsdc`, `paperTrading` flag
- PAPER mode (`paperTrading: true`): returns paper-only executor — no Polymarket API keys needed
- LIVE mode (`paperTrading: false`): validates all 4 env vars present, creates Signer + Adapter
- LIVE mode: throws clear error if any env var missing (e.g. "POLY_PRIVATE_KEY is required for live trading")

### Non-functional
- Under 80 lines (simple factory, no business logic)
- No `console.log` — use logger
- Zero hardcoded secrets

## Architecture

```
buildPolymarketAdapter(config)
  ├── [PAPER] → { adapter: null, signer: null, exchange: PaperExchange }
  └── [LIVE]  → { adapter: PolymarketAdapter, signer: PolymarketSigner, exchange: null }
```

## Related Code Files

| Action | File |
|--------|------|
| CREATE | `src/desk/polymarket/polymarket-execution-adapter.ts` |
| READ | `src/desk/execution/polymarket-adapter.ts` |
| READ | `src/desk/execution/polymarket-signer.ts` |
| READ | `src/desk/polymarket/trading-pipeline.ts` |

## Implementation Steps

1. Create `src/desk/polymarket/polymarket-execution-adapter.ts`
2. Define `PolymarketExecutionConfig` interface with all required fields
3. Define return type `PolymarketExecutionAdapter` (adapter, signer, exchange — only one side populated)
4. Implement `buildPolymarketAdapter(config)`:
   - If `paperTrading: true`: return paper exchange only
   - If `paperTrading: false`: validate env vars → create Signer → create Adapter → return live pair
5. Add JSDoc for public API
6. Run `pnpm typecheck` to verify no TS errors

## Todo List

- [ ] Create `polymarket-execution-adapter.ts` with builder function
- [ ] Define config + return type interfaces
- [ ] PAPER mode path (return PaperExchange)
- [ ] LIVE mode path (validate env vars, create Signer + Adapter)
- [ ] JSDoc on public export
- [ ] `pnpm typecheck` passes

## Success Criteria

- `buildPolymarketAdapter({ paperTrading: true, ... })` returns paper executor — no API keys needed
- `buildPolymarketAdapter({ paperTrading: false, ... })` throws if `POLY_PRIVATE_KEY` missing
- `buildPolymarketAdapter({ paperTrading: false, ... })` returns live adapter when all env vars set
- 0 TypeScript errors

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Signer throws on invalid key | Catch in builder, wrap with clear error message referencing which env var |
| Missing env vars in LIVE mode | Validate all 4 upfront, throw before creating any objects |


## Security Considerations
- Private key never logged — only validate format via `isPaperKey()`
- API secret never appears in error messages
- Env vars read once at construction, not stored beyond adapter lifetime
