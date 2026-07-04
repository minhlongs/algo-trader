# Phase 39: Polymarket Live Execution

**Status:** complete | **Priority:** P0 — unblocks $1M ARR path
**Brainstorm:** `plans/reports/brainstorm-260701-2103-polymarket-live-execution.md`
**Date:** 2026-07-01

## Problem

Platform has 49 Polymarket strategies, full risk infra, and a working CLOB adapter — but zero live trading. Every strategy executes through `paper-executor.ts`. The `buildPolymarketAdapter` import in `trading-pipeline.ts` resolves to a file that doesn't exist.

## Key Discovery (post-brainstorm scout)

HMAC signing in `PolymarketAdapter` is **already implemented** (`computeSignature()` at line 209). The TODO at line 181 is stale. The adapter + signer are production-ready — the missing piece is the builder function that wires them into the pipeline.

## Phases

| # | Phase | Files | Est. Lines | Deps |
|---|-------|-------|------------|------|
| 01 | Polymarket execution adapter builder | 1 new | ~60 | none |
| 02 | Live position tracker | 1 new | ~120 | none |
| 03 | Live order manager | 1 new | ~100 | 01, 02 |
| 04 | Live execution guard | 1 new | ~100 | 02 |
| 05 | Trading pipeline PAPER/LIVE switch | 1 modify, 1 cleanup | ~80 | 01, 03, 04 |
| 06 | CLI live trade commands | 1 modify | ~80 | 05 |
| 07 | Tests + verification | 3 new | ~250 | all |

**Total:** 5 new files, 2 modified, ~790 new lines, ~250 test lines

## Risk Gates (enforced by Phase 04)

- Max position: 2% bankroll per trade (quarter-Kelly default)
- Daily loss limit: 5% → halt all live trading
- Max concurrent: 10 live positions
- Circuit breaker: 3 consecutive losses → revert to paper
- Default mode: PAPER (existing behavior preserved)
- All API keys from env vars only (`POLY_API_KEY`, `POLY_API_SECRET`, `POLY_PASSPHRASE`, `POLY_PRIVATE_KEY`)

## Acceptance Criteria

1. `POST /order` on CLOB returns real order ID with valid HMAC signature
2. `algo trade start --strategy=endgame-v2 --mode=live` places real orders
3. `algo trade status` shows live positions + P&L
4. Daily loss limit triggers → all live trading stops
5. 49 existing paper strategies unchanged (PAPER is default)
6. 0 regressions: 2,591 tests still pass
7. Zero hardcoded secrets

## Out of Scope

- CEX/DEX adapters
- Automated strategy selection for live
- Leverage/margin trading
- Multi-account Polymarket
- WebSocket orderbook for live (use REST polling initially)
